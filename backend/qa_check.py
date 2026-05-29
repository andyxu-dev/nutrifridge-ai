"""
NutriFridge AI — Backend QA Script
Run from the backend/ directory with the server already running:
    python3 qa_check.py
"""

import json
import sys
import datetime
import requests

BASE = "http://localhost:8000"
PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

results = []


def check(label: str, ok: bool, detail: str = ""):
    status = PASS if ok else FAIL
    line = f"  [{status}] {label}"
    if detail:
        line += f"  ({detail})"
    print(line)
    results.append(ok)
    return ok


def section(title: str):
    print(f"\n── {title} {'─' * max(0, 55 - len(title))}")


# ── 1. Health ─────────────────────────────────────────────────────────────────
section("1. Health endpoint")
try:
    r = requests.get(f"{BASE}/health", timeout=5)
    check("GET /health returns 200", r.status_code == 200)
    check("status field is 'ok'", r.json().get("status") == "ok")
except Exception as e:
    check("GET /health reachable", False, str(e))
    print("\n  Server is not running. Start it with:\n  uvicorn app.main:app --reload")
    sys.exit(1)

# ── 2. Profile / Nutrition Target ────────────────────────────────────────────
section("2. Profile & Nutrition Target")
profile_payload = {
    "name": "QA User",
    "age": 30,
    "sex": "male",
    "height_cm": 175.0,
    "weight_kg": 75.0,
    "activity_level": "moderate",
    "goal": "maintenance",
}
try:
    # Always try PUT first (idempotent); fall back to POST if no profile exists yet
    r = requests.put(f"{BASE}/profile", json=profile_payload, timeout=5)
    if r.status_code == 404:
        r = requests.post(f"{BASE}/profile", json=profile_payload, timeout=5)
    profile_ok = r.status_code in (200, 201)
    check("PUT /profile (create or update)", profile_ok, f"status={r.status_code}")
except Exception as e:
    check("PUT /profile", False, str(e))

try:
    r = requests.get(f"{BASE}/nutrition-target", timeout=5)
    check("GET /nutrition-target returns 200", r.status_code == 200)
    data = r.json()
    cal = data.get("calories", 0)
    check("Calorie target is reasonable (1500–4000 kcal)", 1500 <= cal <= 4000, f"{cal:.0f} kcal")
    check("Protein target present and positive", data.get("protein_g", 0) > 0)
    check("Carbs target present and positive", data.get("carbs_g", 0) > 0)
    check("Fat target present and positive", data.get("fat_g", 0) > 0)
except Exception as e:
    check("GET /nutrition-target", False, str(e))

# ── 3. Food Database ──────────────────────────────────────────────────────────
section("3. Food Database")
try:
    r = requests.get(f"{BASE}/foods", timeout=5)
    check("GET /foods returns 200", r.status_code == 200)
    foods = r.json()
    check("At least 30 foods in database", len(foods) >= 30, f"{len(foods)} foods")
except Exception as e:
    check("GET /foods", False, str(e))

try:
    r = requests.get(f"{BASE}/foods/search?q=chicken", timeout=5)
    check("GET /foods/search?q=chicken returns 200", r.status_code == 200)
    results_list = r.json()
    check("Chicken search returns at least 1 result", len(results_list) >= 1, f"{len(results_list)} hits")
    if results_list:
        hit = results_list[0]
        check("Search result has calories_per_100g", "calories_per_100g" in hit)
        check("Search result has protein_per_100g", "protein_per_100g" in hit)
except Exception as e:
    check("GET /foods/search", False, str(e))

# ── 4. Inventory ──────────────────────────────────────────────────────────────
section("4. Inventory — seed data & CRUD")
today = datetime.date.today()

try:
    r = requests.get(f"{BASE}/inventory", timeout=5)
    check("GET /inventory returns 200", r.status_code == 200)
    items = r.json()
    check("Inventory has at least 1 item (seed data present)", len(items) >= 1, f"{len(items)} items")
except Exception as e:
    check("GET /inventory", False, str(e))
    items = []

# Create a test item with lbs unit for unit-conversion test later
test_item_payload = {
    "name": "QA Chicken Breast",
    "quantity": 2.0,
    "unit": "lb",
    "zone": "fridge",
    "category": "meat",
    "added_date": str(today),
    "best_before_date": str(today + datetime.timedelta(days=2)),
    "calories_per_100g": 165.0,
    "protein_per_100g": 31.0,
    "carbs_per_100g": 0.0,
    "fat_per_100g": 3.6,
}
try:
    r = requests.post(f"{BASE}/inventory", json=test_item_payload, timeout=5)
    check("POST /inventory creates item", r.status_code == 201, f"status={r.status_code}")
    test_item = r.json()
    test_item_id = test_item.get("id")
    check("New item has expiration_risk field", "expiration_risk" in test_item)
    check("Item risk is 'high' (2 days out)", test_item.get("expiration_risk") == "high",
          test_item.get("expiration_risk"))
except Exception as e:
    check("POST /inventory", False, str(e))
    test_item_id = None

# ── 5. Urgent Inventory Sorting ───────────────────────────────────────────────
section("5. Urgent inventory sorting")
try:
    r = requests.get(f"{BASE}/inventory/urgent", timeout=5)
    check("GET /inventory/urgent returns 200", r.status_code == 200)
    urgent = r.json()
    check("Urgent list is non-empty (test item with 2-day expiry present)", len(urgent) >= 1,
          f"{len(urgent)} items")
    risks = [i.get("expiration_risk") for i in urgent]
    valid_risks = {"expired", "high", "medium"}
    check("All urgent items have risk expired/high/medium",
          all(r in valid_risks for r in risks), str(risks[:5]))
    if len(urgent) >= 2:
        risk_order = ["expired", "high", "medium", "low", "unknown"]
        first_idx = risk_order.index(urgent[0]["expiration_risk"])
        last_idx = risk_order.index(urgent[-1]["expiration_risk"])
        check("Items sorted: riskier items come first", first_idx <= last_idx,
              f"{urgent[0]['expiration_risk']} → {urgent[-1]['expiration_risk']}")
except Exception as e:
    check("GET /inventory/urgent", False, str(e))

# ── 6. Nutrition Target Calculation ──────────────────────────────────────────
section("6. Nutrition target calculation accuracy")
# Mifflin-St Jeor for male, 30y, 175cm, 75kg, moderately_active, maintenance
# BMR = 10*75 + 6.25*175 - 5*30 + 5 = 750+1093.75-150+5 = 1698.75
# TDEE = 1698.75 * 1.55 = 2633.06  → maintenance = TDEE
expected_cal = round(1698.75 * 1.55)
try:
    r = requests.get(f"{BASE}/nutrition-target", timeout=5)
    data = r.json()
    actual_cal = data.get("calories", 0)
    tolerance = 50  # allow ±50 kcal for rounding
    check(
        f"Calorie target matches Mifflin-St Jeor (expected ~{expected_cal} kcal)",
        abs(actual_cal - expected_cal) <= tolerance,
        f"got {actual_cal:.0f}",
    )
except Exception as e:
    check("Nutrition target accuracy", False, str(e))

# ── 7. Meal Plan ──────────────────────────────────────────────────────────────
section("7. Meal plan generation")
try:
    r = requests.get(f"{BASE}/meal-plan/today", timeout=5)
    check("GET /meal-plan/today returns 200", r.status_code == 200)
    plan = r.json()
    meals = plan.get("meals", [])
    check("Meal plan returns at least 1 meal", len(meals) >= 1, f"{len(meals)} meals")
    if meals:
        meal = meals[0]
        check("Meal has 'name' field", "name" in meal)
        check("Meal has 'ingredients' field", "ingredients" in meal)
        check("Meal has 'macro_gap_helped' field", "macro_gap_helped" in meal)
    check("Plan has 'recommendation_summary'", "recommendation_summary" in plan)
except Exception as e:
    check("GET /meal-plan/today", False, str(e))

# ── 8. Nutrition Log — Mark as Eaten & Macro Update ─────────────────────────
section("8. Nutrition log — mark as eaten & macro update")
try:
    r = requests.get(f"{BASE}/nutrition-log/today", timeout=5)
    check("GET /nutrition-log/today returns 200", r.status_code == 200)
    log_before = r.json()
    cal_before = log_before.get("consumed", {}).get("calories", 0)

    meal_payload = {
        "meal_type": "lunch",
        "meal_name": "QA Test Meal",
        "calories": 400.0,
        "protein_g": 30.0,
        "carbs_g": 40.0,
        "fat_g": 10.0,
        "ingredients_used": [],
    }
    r = requests.post(f"{BASE}/nutrition-log/meal", json=meal_payload, timeout=5)
    check("POST /nutrition-log/meal returns 200", r.status_code == 200, f"status={r.status_code}")
    # POST returns the full log response; find the most recently created matching meal
    meal_log_id = None
    if r.status_code == 200:
        for m in reversed(r.json().get("meals", [])):
            if m.get("meal_name") == "QA Test Meal":
                meal_log_id = m.get("id")
                break

    r = requests.get(f"{BASE}/nutrition-log/today", timeout=5)
    log_after = r.json()
    cal_after = log_after.get("consumed", {}).get("calories", 0)
    check("Calories consumed increased by 400 after logging meal",
          abs(cal_after - cal_before - 400) < 1, f"{cal_before} → {cal_after}")

    protein_after = log_after.get("consumed", {}).get("protein_g", 0)
    check("Protein consumed is tracked", protein_after > 0, f"{protein_after}g")

    # Clean up — delete the test meal log
    if meal_log_id:
        r = requests.delete(f"{BASE}/nutrition-log/meal/{meal_log_id}", timeout=5)
        check("DELETE /nutrition-log/meal/{id} returns 200", r.status_code == 200)
except Exception as e:
    check("Nutrition log flow", False, str(e))

# ── 9. Inventory Deduction — lb-to-g unit conversion ────────────────────────
section("9. Inventory deduction with mass-unit conversion (lb → g)")
if test_item_id:
    qty_before = 2.0  # lb
    try:
        meal_with_deduction = {
            "meal_type": "dinner",
            "meal_name": "QA Deduction Test",
            "calories": 300.0,
            "protein_g": 25.0,
            "carbs_g": 0.0,
            "fat_g": 5.0,
            "ingredients_used": [
                {
                    "inventory_item_id": test_item_id,
                    "name": "QA Chicken Breast",
                    "quantity_used": 150,
                    "unit": "g",
                }
            ],
        }
        r = requests.post(f"{BASE}/nutrition-log/meal", json=meal_with_deduction, timeout=5)
        check("POST /nutrition-log/meal with lb ingredient (used in g) succeeds",
              r.status_code == 200, f"status={r.status_code}")
        deduction_meal_id = r.json().get("meal_log_id") if r.status_code == 200 else None

        r = requests.get(f"{BASE}/inventory/{test_item_id}", timeout=5)
        item_after = r.json()
        qty_after = item_after.get("quantity", qty_before)
        # 150g = 0.3307 lb; new qty should be ~1.669 lb
        expected_qty = qty_before - (150 / 453.592)
        check(
            "Quantity deducted correctly (150g from 2lb stock → ~1.67lb)",
            abs(qty_after - expected_qty) < 0.05,
            f"{qty_before}lb → {qty_after:.4f}lb (expected ~{expected_qty:.4f}lb)",
        )

        # Clean up
        if deduction_meal_id:
            requests.delete(f"{BASE}/nutrition-log/meal/{deduction_meal_id}", timeout=5)
    except Exception as e:
        check("Inventory deduction with unit conversion", False, str(e))
else:
    check("Inventory deduction (skipped — test item not created)", False, "test_item_id missing")

# Clean up test inventory item
if test_item_id:
    try:
        requests.delete(f"{BASE}/inventory/{test_item_id}", timeout=5)
    except Exception:
        pass

# ── 10. User Preference Fields ────────────────────────────────────────────────
section("10. User preference fields")
preference_payload = {
    "name": "QA User",
    "age": 30,
    "sex": "male",
    "height_cm": 175.0,
    "weight_kg": 75.0,
    "activity_level": "moderate",
    "goal": "maintenance",
    "cuisine_preference": "mixed",
    "cooking_time_preference": "normal_30_min",
    "diet_style": "high_protein",
    "disliked_foods": ["mushroom", "liver"],
    "preferred_foods": ["chicken breast", "eggs"],
}
try:
    r = requests.put(f"{BASE}/profile", json=preference_payload, timeout=5)
    check("PUT /profile with preference fields returns 200", r.status_code == 200, f"status={r.status_code}")
    data = r.json()
    check("cuisine_preference saved", data.get("cuisine_preference") == "mixed")
    check("cooking_time_preference saved", data.get("cooking_time_preference") == "normal_30_min")
    check("diet_style saved", data.get("diet_style") == "high_protein")
    check("disliked_foods deserialized as list", isinstance(data.get("disliked_foods"), list))
    check("preferred_foods deserialized as list", isinstance(data.get("preferred_foods"), list))
    check("disliked_foods contains 'mushroom'", "mushroom" in (data.get("disliked_foods") or []))
except Exception as e:
    check("Preference fields", False, str(e))

# ── 11. Meal Scoring ──────────────────────────────────────────────────────────
section("11. Meal plan scoring & template fields")
try:
    r = requests.get(f"{BASE}/meal-plan/today", timeout=5)
    check("GET /meal-plan/today returns 200", r.status_code == 200)
    plan = r.json()
    meals = plan.get("meals", [])
    check("Meal plan has at least 1 meal", len(meals) >= 1, f"{len(meals)} meals")
    if meals:
        meal = meals[0]
        check("Meal has 'score' field", "score" in meal, str(meal.get("score")))
        check("Score is between 0 and 100", 0 <= meal.get("score", -1) <= 100,
              str(meal.get("score")))
        check("Meal has 'score_breakdown' dict", isinstance(meal.get("score_breakdown"), dict))
        check("score_breakdown has 'urgency' key", "urgency" in (meal.get("score_breakdown") or {}))
        check("score_breakdown has 'preference' key", "preference" in (meal.get("score_breakdown") or {}))
        check("Meal has 'instructions' (list)", isinstance(meal.get("instructions"), list))
        check("Instructions has at least 1 step", len(meal.get("instructions", [])) >= 1)
        check("Meal has 'cuisine' field", "cuisine" in meal)
        check("Meal has 'cooking_time_minutes' field", "cooking_time_minutes" in meal)
        check("cooking_time_minutes is a positive int", meal.get("cooking_time_minutes", 0) > 0)
        check("Meal has 'tags' field (list)", isinstance(meal.get("tags"), list))
except Exception as e:
    check("Meal scoring", False, str(e))

# ── 12. Grocery List ──────────────────────────────────────────────────────────
section("12. Weekly grocery list")
try:
    r = requests.get(f"{BASE}/grocery-list/weekly", timeout=5)
    check("GET /grocery-list/weekly returns 200", r.status_code == 200, f"status={r.status_code}")
    data = r.json()
    check("Response has 'recommended_to_buy'", "recommended_to_buy" in data)
    check("Response has 'avoid_buying'", "avoid_buying" in data)
    check("Response has 'nutrition_gap_summary'", "nutrition_gap_summary" in data)
    check("Response has 'inventory_summary'", "inventory_summary" in data)
    inv_summary = data.get("inventory_summary", {})
    check("inventory_summary has 'total_items'", "total_items" in inv_summary)
    check("inventory_summary has 'urgent_count'", "urgent_count" in inv_summary)
    gap = data.get("nutrition_gap_summary", {})
    check("nutrition_gap_summary has 'analysis' string", isinstance(gap.get("analysis"), str))
    recs = data.get("recommended_to_buy", [])
    if recs:
        rec = recs[0]
        check("Each recommendation has 'name', 'reason', 'priority'",
              all(k in rec for k in ("name", "reason", "priority")))
except Exception as e:
    check("Grocery list", False, str(e))

# ── 13. Discard & Waste Log ───────────────────────────────────────────────────
section("13. Discard item & waste log")
# Create a temporary item to discard
discard_item_id = None
try:
    r = requests.post(f"{BASE}/inventory", json={
        "name": "QA Discard Test Item",
        "quantity": 1.0,
        "unit": "kg",
        "zone": "fridge",
        "category": "vegetable",
        "calories_per_100g": 23.0,
    }, timeout=5)
    if r.status_code == 201:
        discard_item_id = r.json().get("id")

    if discard_item_id:
        r = requests.post(
            f"{BASE}/inventory/{discard_item_id}/discard",
            json={"reason": "expired"},
            timeout=5,
        )
        check("POST /inventory/{id}/discard returns 201", r.status_code == 201, f"status={r.status_code}")
        resp = r.json()
        check("Discard response has 'waste_log_id'", "waste_log_id" in resp)
        check("Discard response has 'estimated_calories_wasted'", "estimated_calories_wasted" in resp)
        check("estimated_calories_wasted is a positive number",
              (resp.get("estimated_calories_wasted") or 0) > 0,
              str(resp.get("estimated_calories_wasted")))

        # Check waste log
        r = requests.get(f"{BASE}/waste-log", timeout=5)
        check("GET /waste-log returns 200", r.status_code == 200)
        waste_entries = r.json()
        check("Waste log has at least 1 entry", len(waste_entries) >= 1, f"{len(waste_entries)} entries")
        if waste_entries:
            entry = waste_entries[0]
            check("Waste entry has 'item_name'", "item_name" in entry)
            check("Waste entry has 'reason'", "reason" in entry)
            check("Waste entry has 'discarded_at'", "discarded_at" in entry)
    else:
        check("Discard test item creation", False, "could not create test item")
except Exception as e:
    check("Discard / waste log", False, str(e))

# ── Summary ───────────────────────────────────────────────────────────────────
total = len(results)
passed = sum(results)
failed = total - passed
print(f"\n{'═' * 60}")
print(f"  Results: {passed}/{total} passed", end="")
if failed:
    print(f"  ({failed} FAILED)")
else:
    print("  — all checks passed!")
print(f"{'═' * 60}\n")

sys.exit(0 if failed == 0 else 1)
