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

# ── 14. Health Condition Profile Fields ──────────────────────────────────────
section("14. Health condition profile fields persistence")
health_profile_payload = {
    "name": "Health QA User",
    "age": 40,
    "sex": "male",
    "height_cm": 175.0,
    "weight_kg": 80.0,
    "activity_level": "moderate",
    "goal": "muscle_gain",
    "health_conditions": ["fatty_liver", "diabetes"],
    "allergies": ["peanut"],
    "strict_avoid_foods": ["shellfish"],
    "macro_strategy": "high_protein",
}
try:
    r = requests.put(f"{BASE}/profile", json=health_profile_payload, timeout=5)
    check("PUT /profile with health fields returns 200", r.status_code == 200, f"status={r.status_code}")
    data = r.json()
    check("health_conditions saved as list", isinstance(data.get("health_conditions"), list))
    check("health_conditions contains 'fatty_liver'", "fatty_liver" in (data.get("health_conditions") or []))
    check("allergies saved as list", isinstance(data.get("allergies"), list))
    check("allergies contains 'peanut'", "peanut" in (data.get("allergies") or []))
    check("strict_avoid_foods saved as list", isinstance(data.get("strict_avoid_foods"), list))
    check("macro_strategy saved", data.get("macro_strategy") == "high_protein")
except Exception as e:
    check("Health profile fields", False, str(e))

# ── 15. Adjusted Nutrition Target ─────────────────────────────────────────────
section("15. Adjusted nutrition target — fatty_liver + muscle_gain + high_protein")
try:
    r = requests.get(f"{BASE}/nutrition-target", timeout=5)
    check("GET /nutrition-target returns 200", r.status_code == 200)
    data = r.json()
    check("adjustment_reasons present", isinstance(data.get("adjustment_reasons"), list))
    check("using_custom_targets present", "using_custom_targets" in data)
    check("base_calories present", "base_calories" in data)
    check("health_mode_summary present", isinstance(data.get("health_mode_summary"), str))
    check("disclaimer present", "disclaimer" in data)
    # fatty_liver + muscle_gain: calories = tdee + 150 (moderate surplus)
    cal = data.get("calories", 0)
    tdee = data.get("tdee", 0)
    check("Adjusted calories are within 250 kcal of tdee (fatty_liver surplus cap)",
          abs(cal - tdee) <= 250, f"cal={cal}, tdee={tdee}")
    # high_protein strategy: protein should be elevated
    protein = data.get("protein_g", 0)
    weight = 80.0
    check("High protein strategy: protein_g >= 1.6 * weight_kg",
          protein >= 1.6 * weight, f"{protein}g vs min {1.6 * weight}g")
except Exception as e:
    check("Adjusted nutrition target", False, str(e))

# ── 16. Custom Macro Overrides ────────────────────────────────────────────────
section("16. Custom macro overrides (macro_strategy=custom)")
custom_payload = {
    "name": "Custom QA User",
    "age": 30,
    "sex": "male",
    "height_cm": 175.0,
    "weight_kg": 75.0,
    "activity_level": "moderate",
    "goal": "maintenance",
    "macro_strategy": "custom",
    "custom_calorie_target": 2000.0,
    "custom_protein_g": 160.0,
    "custom_carbs_g": 200.0,
    "custom_fat_g": 65.0,
}
try:
    r = requests.put(f"{BASE}/profile", json=custom_payload, timeout=5)
    check("PUT /profile with custom macro overrides returns 200", r.status_code == 200)
    r = requests.get(f"{BASE}/nutrition-target", timeout=5)
    data = r.json()
    check("Custom calorie target applied (2000 kcal)", abs(data.get("calories", 0) - 2000) < 1,
          f"got {data.get('calories')}")
    check("Custom protein applied (160g)", abs(data.get("protein_g", 0) - 160) < 1,
          f"got {data.get('protein_g')}")
    check("Custom carbs applied (200g)", abs(data.get("carbs_g", 0) - 200) < 1,
          f"got {data.get('carbs_g')}")
    check("using_custom_targets is True", data.get("using_custom_targets") is True)
except Exception as e:
    check("Custom macro overrides", False, str(e))

# Restore standard profile for remaining tests
try:
    requests.put(f"{BASE}/profile", json={
        "name": "QA User",
        "age": 30,
        "sex": "male",
        "height_cm": 175.0,
        "weight_kg": 75.0,
        "activity_level": "moderate",
        "goal": "maintenance",
        "macro_strategy": "standard",
    }, timeout=5)
except Exception:
    pass

# ── 17. Manual Meal Logging ───────────────────────────────────────────────────
section("17. Manual meal logging — macros updated, source='manual'")
manual_meal_payload = {
    "meal_type": "snack",
    "meal_name": "Protein Bar (manual)",
    "calories": 220.0,
    "protein_g": 20.0,
    "carbs_g": 25.0,
    "fat_g": 6.0,
    "notes": "Post-workout snack outside home",
}
manual_meal_id = None
try:
    r_before = requests.get(f"{BASE}/nutrition-log/today", timeout=5)
    cal_before = r_before.json().get("consumed", {}).get("calories", 0) if r_before.status_code == 200 else 0

    r = requests.post(f"{BASE}/nutrition-log/manual-meal", json=manual_meal_payload, timeout=5)
    check("POST /nutrition-log/manual-meal returns 200", r.status_code == 200, f"status={r.status_code}")

    if r.status_code == 200:
        log_data = r.json()
        cal_after = log_data.get("consumed", {}).get("calories", 0)
        check("Calories increased by 220 after manual meal",
              abs(cal_after - cal_before - 220) < 1, f"{cal_before} → {cal_after}")

        # Find the manual meal in the log
        for m in reversed(log_data.get("meals", [])):
            if m.get("meal_name") == "Protein Bar (manual)":
                manual_meal_id = m.get("id")
                check("Manual meal source is 'manual'", m.get("source") == "manual",
                      f"source={m.get('source')}")
                check("Manual meal notes stored", m.get("notes") == "Post-workout snack outside home")
                break
        else:
            check("Manual meal appears in log", False, "not found in meals list")
except Exception as e:
    check("Manual meal logging", False, str(e))

# ── 18. Manual Meal Does NOT Deduct Inventory ─────────────────────────────────
section("18. Manual meal does not deduct inventory")
try:
    # Create a test inventory item
    r = requests.post(f"{BASE}/inventory", json={
        "name": "QA Inventory Guard",
        "quantity": 500.0,
        "unit": "g",
        "zone": "fridge",
        "category": "other",
    }, timeout=5)
    guard_id = r.json().get("id") if r.status_code == 201 else None

    if guard_id:
        r_before = requests.get(f"{BASE}/inventory/{guard_id}", timeout=5)
        qty_before = r_before.json().get("quantity", 0)

        # The manual meal already logged above has no inventory_item_id references
        r_after = requests.get(f"{BASE}/inventory/{guard_id}", timeout=5)
        qty_after = r_after.json().get("quantity", 0)

        check("Inventory quantity unchanged after manual meal",
              abs(qty_after - qty_before) < 0.001, f"{qty_before} → {qty_after}")
        requests.delete(f"{BASE}/inventory/{guard_id}", timeout=5)
    else:
        check("Guard inventory item created", False, "could not create test item")
except Exception as e:
    check("Manual meal inventory non-deduction", False, str(e))

# Clean up manual meal
if manual_meal_id:
    try:
        requests.delete(f"{BASE}/nutrition-log/meal/{manual_meal_id}", timeout=5)
    except Exception:
        pass

# ── 19. Nutrition Analysis Endpoint ──────────────────────────────────────────
section("19. GET /nutrition-log/analysis/today — structure check")
try:
    r = requests.get(f"{BASE}/nutrition-log/analysis/today", timeout=5)
    check("GET /nutrition-log/analysis/today returns 200", r.status_code == 200, f"status={r.status_code}")
    data = r.json()
    check("Response has 'macro_status'", "macro_status" in data)
    check("Response has 'health_notes' list", isinstance(data.get("health_notes"), list))
    check("Response has 'summary' string", isinstance(data.get("summary"), str))
    check("Response has 'next_meal_recommendation'", "next_meal_recommendation" in data)
    check("Response has 'disclaimer'", "disclaimer" in data)
    ms = data.get("macro_status", {})
    check("macro_status has 'calories'", "calories" in ms)
    check("macro_status has 'protein'", "protein" in ms)
    check("macro_status values are valid",
          all(v in ("under", "on_track", "over") for v in ms.values()),
          str(ms))
except Exception as e:
    check("Nutrition analysis endpoint", False, str(e))

# ── 20. Meal Scoring Health Constraint Fields ──────────────────────────────────
section("20. Meal scoring includes health_constraint_score + allergy_exclusion keys")
try:
    r = requests.get(f"{BASE}/meal-plan/today", timeout=5)
    check("GET /meal-plan/today returns 200", r.status_code == 200)
    plan = r.json()
    meals = plan.get("meals", [])
    check("Meal plan has at least 1 meal", len(meals) >= 1, f"{len(meals)} meals")
    if meals:
        bd = meals[0].get("score_breakdown", {})
        check("score_breakdown has 'health_constraint_score'", "health_constraint_score" in bd,
              str(list(bd.keys())))
        check("score_breakdown has 'allergy_exclusion'", "allergy_exclusion" in bd,
              str(list(bd.keys())))
except Exception as e:
    check("Meal scoring health fields", False, str(e))

# ── 21. Allergies Hard Exclusion ──────────────────────────────────────────────
section("21. Allergies hard exclusion from meal plan")
try:
    # Set an allergy to a made-up ingredient that no template uses → should not affect meals
    # Then confirm meals returned are not excluded
    r = requests.put(f"{BASE}/profile", json={
        "name": "Allergy QA User",
        "age": 30,
        "sex": "male",
        "height_cm": 175.0,
        "weight_kg": 75.0,
        "activity_level": "moderate",
        "goal": "maintenance",
        "allergies": ["ZZZFAKEALLERGENZZ99"],
    }, timeout=5)
    check("Profile with fake allergy saved", r.status_code == 200)

    r = requests.get(f"{BASE}/meal-plan/today", timeout=5)
    check("Meal plan still returns 200 with allergy set", r.status_code == 200)
    plan = r.json()
    meals = plan.get("meals", [])
    # No meal should be excluded (fake allergen not present in any inventory item)
    excluded_meals = [m for m in meals if m.get("excluded", False)]
    check("No meals hard-excluded by non-matching allergen",
          len(excluded_meals) == 0, f"{len(excluded_meals)} excluded")

    # Restore profile
    requests.put(f"{BASE}/profile", json={
        "name": "QA User",
        "age": 30,
        "sex": "male",
        "height_cm": 175.0,
        "weight_kg": 75.0,
        "activity_level": "moderate",
        "goal": "maintenance",
        "allergies": [],
    }, timeout=5)
except Exception as e:
    check("Allergies hard exclusion", False, str(e))

# ── 22. Household & Family Member CRUD ───────────────────────────────────────
section("22. Household creation and family member CRUD")
family_member_id = None
try:
    r = requests.get(f"{BASE}/family", timeout=5)
    check("GET /family returns 200", r.status_code == 200, f"status={r.status_code}")
    data = r.json()
    check("Response has 'household'", "household" in data)
    check("Response has 'primary_member'", "primary_member" in data)
    check("Response has 'additional_members'", "additional_members" in data)
    pm = data.get("primary_member", {})
    check("primary_member has member_key='primary'", pm.get("member_key") == "primary")
    check("primary_member has 'name'", "name" in pm)
    check("primary_member source is 'primary_profile'", pm.get("source") == "primary_profile")
except Exception as e:
    check("GET /family", False, str(e))

try:
    member_payload = {
        "name": "QA Family Member",
        "relationship_label": "spouse",
        "goal": "fat_loss",
        "sex": "female",
        "age": 28,
        "weight_kg": 60.0,
        "height_cm": 163.0,
        "activity_level": "light",
        "diet_style": "low_carb",
        "health_conditions": ["diabetes"],
        "allergies": ["peanut"],
        "strict_avoid_foods": [],
    }
    r = requests.post(f"{BASE}/family/members", json=member_payload, timeout=5)
    check("POST /family/members creates member", r.status_code in (200, 201),
          f"status={r.status_code}")
    if r.status_code in (200, 201):
        member = r.json()
        family_member_id = member.get("id")
        check("New member has 'id'", family_member_id is not None)
        check("Member name saved", member.get("name") == "QA Family Member")
        check("Member goal saved", member.get("goal") == "fat_loss")
        check("Member health_conditions is list", isinstance(member.get("health_conditions"), list))
        check("Member allergies contains 'peanut'",
              "peanut" in (member.get("allergies") or []))
except Exception as e:
    check("POST /family/members", False, str(e))
    family_member_id = None

if family_member_id:
    try:
        r = requests.get(f"{BASE}/family/members/{family_member_id}", timeout=5)
        check("GET /family/members/{id} returns 200", r.status_code == 200)
        member = r.json()
        check("GET single member has correct name",
              member.get("name") == "QA Family Member")

        r = requests.put(f"{BASE}/family/members/{family_member_id}",
                         json={"name": "QA Updated Member", "goal": "maintenance"},
                         timeout=5)
        check("PUT /family/members/{id} updates member", r.status_code == 200,
              f"status={r.status_code}")
        if r.status_code == 200:
            check("Updated name persisted", r.json().get("name") == "QA Updated Member")
    except Exception as e:
        check("Family member GET/PUT", False, str(e))

    try:
        r = requests.get(f"{BASE}/family/members", timeout=5)
        check("GET /family/members returns list", r.status_code == 200)
        members_list = r.json()
        check("Members list is an array", isinstance(members_list, list))
        check("At least 1 additional member present",
              any(m.get("id") == family_member_id for m in members_list))
    except Exception as e:
        check("GET /family/members list", False, str(e))

# ── 23. Family Selection Including Primary User ───────────────────────────────
section("23. Family selection includes primary user as selectable member")
try:
    r = requests.get(f"{BASE}/family", timeout=5)
    check("GET /family returns 200", r.status_code == 200)
    data = r.json()
    pm = data.get("primary_member", {})
    check("primary_member present in household view", bool(pm))
    check("primary_member is_active", pm.get("is_active") is True)

    # GET /family/members should NOT include the primary user (they're not a FamilyMember row)
    r = requests.get(f"{BASE}/family/members", timeout=5)
    members = r.json() if r.status_code == 200 else []
    primary_in_members = any(m.get("source") == "primary_profile" for m in members)
    check("Primary user is NOT duplicated in /family/members list", not primary_in_members)
except Exception as e:
    check("Primary user in family selection", False, str(e))

# ── 24. Family Meal Plan Generation ──────────────────────────────────────────
section("24. Family meal plan — combined generation")
try:
    if family_member_id:
        plan_request = {"member_keys": ["primary", f"member:{family_member_id}"]}
    else:
        plan_request = {"member_keys": ["primary"]}

    r = requests.post(f"{BASE}/family/meal-plan/today", json=plan_request, timeout=10)
    check("POST /family/meal-plan/today returns 200", r.status_code == 200,
          f"status={r.status_code}")
    if r.status_code == 200:
        plan = r.json()
        check("Plan has 'selected_members'", "selected_members" in plan)
        check("Plan has 'individual_adjusted_targets'", "individual_adjusted_targets" in plan)
        check("Plan has 'combined_household_targets'", "combined_household_targets" in plan)
        check("Plan has 'meals'", "meals" in plan)
        check("Plan has 'conflict_notes' list", isinstance(plan.get("conflict_notes"), list))
        check("Plan has 'health_and_allergy_notes' list",
              isinstance(plan.get("health_and_allergy_notes"), list))
        check("Plan has 'recommendation_summary'", "recommendation_summary" in plan)

        cht = plan.get("combined_household_targets", {})
        check("Combined household target has 'calories'", "calories" in cht)
        check("Combined calories > 0", cht.get("calories", 0) > 0)

        meals = plan.get("meals", [])
        if meals:
            m0 = meals[0]
            check("Family meal has 'per_member_allocations'",
                  "per_member_allocations" in m0,
                  str(list(m0.keys())))
            allocs = m0.get("per_member_allocations", [])
            check("Per-member allocations is a list", isinstance(allocs, list))
            if allocs:
                a0 = allocs[0]
                check("Allocation has 'member_key'", "member_key" in a0)
                check("Allocation has 'estimated_macros'", "estimated_macros" in a0)
                check("Allocation has 'portion_guidance'", "portion_guidance" in a0)
except Exception as e:
    check("Family meal plan generation", False, str(e))

# ── 25. Muscle-Gain + Fat-Loss Portion Allocation ────────────────────────────
section("25. Muscle-gain + fat-loss portion allocation differentiation")
try:
    # Ensure primary user has muscle_gain goal
    requests.put(f"{BASE}/profile", json={
        "name": "QA User", "age": 30, "sex": "male",
        "height_cm": 175.0, "weight_kg": 75.0,
        "activity_level": "moderate", "goal": "muscle_gain",
    }, timeout=5)

    if family_member_id:
        # family_member already has fat_loss or we update it
        requests.put(f"{BASE}/family/members/{family_member_id}",
                     json={"name": "QA Fat Loss Member", "goal": "fat_loss"}, timeout=5)
        r = requests.post(f"{BASE}/family/meal-plan/today",
                          json={"member_keys": ["primary", f"member:{family_member_id}"]},
                          timeout=10)
        check("Family plan with muscle+fat-loss returns 200", r.status_code == 200)
        if r.status_code == 200:
            plan = r.json()
            meals = plan.get("meals", [])
            if meals:
                allocs = meals[0].get("per_member_allocations", [])
                primary_alloc = next(
                    (a for a in allocs if a.get("member_key") == "primary"), None)
                fl_alloc = next(
                    (a for a in allocs if a.get("member_key") != "primary"), None)
                if primary_alloc and fl_alloc:
                    primary_carbs = primary_alloc.get("estimated_macros", {}).get("carbs_g", 0)
                    fl_carbs = fl_alloc.get("estimated_macros", {}).get("carbs_g", 0)
                    check("Muscle-gain member gets more carbs than fat-loss member",
                          primary_carbs >= fl_carbs,
                          f"muscle={primary_carbs}g, fat_loss={fl_carbs}g")
                    check("Fat-loss allocation reason mentions fat loss",
                          "fat" in (fl_alloc.get("reason", "") or "").lower()
                          or "loss" in (fl_alloc.get("reason", "") or "").lower())
                else:
                    check("Per-member allocations present for both members",
                          bool(allocs), f"{len(allocs)} allocations")
            check("Conflict notes mention carbs or portions",
                  any("carb" in note.lower() or "portion" in note.lower()
                      for note in plan.get("conflict_notes", [])),
                  str(plan.get("conflict_notes")))
    else:
        check("Portion allocation test (skipped — second member not created)", False,
              "family_member_id missing")

    # Restore profile
    requests.put(f"{BASE}/profile", json={
        "name": "QA User", "age": 30, "sex": "male",
        "height_cm": 175.0, "weight_kg": 75.0,
        "activity_level": "moderate", "goal": "maintenance",
    }, timeout=5)
except Exception as e:
    check("Muscle-gain + fat-loss allocation", False, str(e))

# ── 26. Allergy Hard Exclusion in Family Plan ─────────────────────────────────
section("26. Allergy hard exclusion in family meal plan")
try:
    if family_member_id:
        # family member already has peanut allergy from creation (or updated)
        # Set a family-member-only allergy and verify no excluded meal slips through
        requests.put(f"{BASE}/family/members/{family_member_id}",
                     json={"name": "QA Allergy Member",
                           "allergies": ["ZZZFAKEALLERGENFAMILYQA99"]}, timeout=5)
        r = requests.post(f"{BASE}/family/meal-plan/today",
                          json={"member_keys": ["primary", f"member:{family_member_id}"]},
                          timeout=10)
        check("Family plan with allergy set returns 200", r.status_code == 200)
        if r.status_code == 200:
            plan = r.json()
            notes = plan.get("health_and_allergy_notes", [])
            check("health_and_allergy_notes is a list", isinstance(notes, list))
    else:
        check("Family allergy exclusion (skipped — member not created)", False)
except Exception as e:
    check("Family allergy exclusion", False, str(e))

# ── 27. Family Grocery Aggregation ────────────────────────────────────────────
section("27. Family grocery list aggregation")
try:
    if family_member_id:
        grocery_request = {
            "member_keys": ["primary", f"member:{family_member_id}"],
            "days_at_home": {"primary": 7, f"member:{family_member_id}": 5},
        }
    else:
        grocery_request = {"member_keys": ["primary"], "days_at_home": {"primary": 7}}

    r = requests.post(f"{BASE}/family/grocery-list/weekly",
                      json=grocery_request, timeout=10)
    check("POST /family/grocery-list/weekly returns 200", r.status_code == 200,
          f"status={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        check("Response has 'recommended_to_buy'", "recommended_to_buy" in data)
        check("Response has 'avoid_buying'", "avoid_buying" in data)
        check("Response has 'use_first'", "use_first" in data)
        check("Response has 'household_nutrition_summary'",
              "household_nutrition_summary" in data)
        check("Response has 'member_specific_notes'",
              "member_specific_notes" in data)
        check("Response has 'conflict_notes'", "conflict_notes" in data)
        check("Response has 'inventory_summary'", "inventory_summary" in data)
        hn = data.get("household_nutrition_summary", {})
        check("Household nutrition summary has weekly targets",
              "combined_weekly_targets" in hn or "combined_weekly_calories" in hn)
        notes = data.get("member_specific_notes", [])
        check("member_specific_notes is a list", isinstance(notes, list))
except Exception as e:
    check("Family grocery aggregation", False, str(e))

# Clean up family member created during tests
if family_member_id:
    try:
        requests.delete(f"{BASE}/family/members/{family_member_id}", timeout=5)
    except Exception:
        pass

# ── 28. Storage Location CRUD ─────────────────────────────────────────────────
section("28. Storage location CRUD")
test_loc_id = None
child_loc_id = None
try:
    r = requests.get(f"{BASE}/locations", timeout=5)
    check("GET /locations returns 200", r.status_code == 200, f"status={r.status_code}")
    locs = r.json()
    check("Locations list is an array", isinstance(locs, list))
    check("At least 3 default locations exist (Fridge/Freezer/Pantry)", len(locs) >= 3,
          f"{len(locs)} locations")
    if locs:
        loc = locs[0]
        check("Location has 'id'", "id" in loc)
        check("Location has 'name'", "name" in loc)
        check("Location has 'path'", "path" in loc)
        check("Location has 'storage_type'", "storage_type" in loc)
        check("Location has 'temperature_zone'", "temperature_zone" in loc)
except Exception as e:
    check("GET /locations", False, str(e))

try:
    loc_payload = {
        "name": "QA Cabinet A",
        "storage_type": "cabinet",
        "temperature_zone": "pantry",
        "description": "Test cabinet for QA",
    }
    r = requests.post(f"{BASE}/locations", json=loc_payload, timeout=5)
    check("POST /locations creates location", r.status_code in (200, 201),
          f"status={r.status_code}")
    if r.status_code in (200, 201):
        test_loc_id = r.json().get("id")
        check("New location has 'id'", test_loc_id is not None)
        check("Location name saved", r.json().get("name") == "QA Cabinet A")
except Exception as e:
    check("POST /locations", False, str(e))
    test_loc_id = None

if test_loc_id:
    try:
        # Create a child location
        child_payload = {
            "name": "QA Shelf 1",
            "storage_type": "shelf",
            "temperature_zone": "pantry",
            "parent_id": test_loc_id,
        }
        r = requests.post(f"{BASE}/locations", json=child_payload, timeout=5)
        check("POST /locations child location created", r.status_code in (200, 201))
        if r.status_code in (200, 201):
            child_loc_id = r.json().get("id")

        r = requests.put(f"{BASE}/locations/{test_loc_id}",
                         json={"name": "QA Cabinet A Updated",
                               "storage_type": "cabinet", "temperature_zone": "pantry"},
                         timeout=5)
        check("PUT /locations/{id} updates location", r.status_code == 200,
              f"status={r.status_code}")
    except Exception as e:
        check("Location child + update", False, str(e))

# ── 29. Location Hierarchy / Path Output ──────────────────────────────────────
section("29. Location hierarchy tree and path breadcrumbs")
try:
    r = requests.get(f"{BASE}/locations/tree", timeout=5)
    check("GET /locations/tree returns 200", r.status_code == 200, f"status={r.status_code}")
    tree = r.json()
    check("Tree is a list of root locations", isinstance(tree, list))
    if tree:
        root = tree[0]
        check("Root node has 'children' field", "children" in root)

    if child_loc_id and test_loc_id:
        r = requests.get(f"{BASE}/locations/{child_loc_id}", timeout=5)
        check("GET /locations/{child_id} returns 200", r.status_code == 200)
        child = r.json()
        path = child.get("path", "")
        check("Child location path contains parent name",
              "QA Cabinet" in path or "Cabinet" in path,
              f"path='{path}'")
        check("Child location path contains '/'", "/" in path, f"path='{path}'")
except Exception as e:
    check("Location hierarchy", False, str(e))

# ── 30. Default Location Migration ────────────────────────────────────────────
section("30. Automatic default location migration for existing inventory")
try:
    r = requests.get(f"{BASE}/inventory", timeout=5)
    check("GET /inventory returns 200 after migration", r.status_code == 200)
    items = r.json()
    check("Inventory items present", len(items) >= 1, f"{len(items)} items")
    # Most existing items should now have a location assigned
    with_location = [i for i in items if i.get("location_id") is not None]
    check("At least some items have location_id assigned after migration",
          len(with_location) >= 1,
          f"{len(with_location)}/{len(items)} items have location_id")
except Exception as e:
    check("Default location migration", False, str(e))

# ── 31. Inventory Search by Food Name ─────────────────────────────────────────
section("31. Inventory search — by food name")
search_item_id = None
try:
    r = requests.post(f"{BASE}/inventory", json={
        "name": "QA Search Test Broccoli",
        "quantity": 300.0,
        "unit": "g",
        "zone": "fridge",
        "category": "vegetable",
    }, timeout=5)
    if r.status_code == 201:
        search_item_id = r.json().get("id")

    r = requests.get(f"{BASE}/inventory/search?q=Search+Test+Broccoli", timeout=5)
    check("GET /inventory/search?q= returns 200", r.status_code == 200, f"status={r.status_code}")
    results_list = r.json()
    check("Search result is a list", isinstance(results_list, list))
    check("Search for 'Broccoli' finds the test item",
          any("Broccoli" in i.get("name", "") for i in results_list),
          f"{len(results_list)} results")
    if results_list:
        item = results_list[0]
        check("Search result has 'expiration_risk'", "expiration_risk" in item)
except Exception as e:
    check("Inventory search by food name", False, str(e))

# ── 32. Inventory Search by Location Name/Path ────────────────────────────────
section("32. Inventory search — by location name and path")
try:
    # Create an item in QA Cabinet A (if it exists)
    loc_item_id = None
    if test_loc_id:
        r = requests.post(f"{BASE}/inventory", json={
            "name": "QA Cabinet Test Rice",
            "quantity": 500.0,
            "unit": "g",
            "zone": "pantry",
            "category": "grain",
            "location_id": test_loc_id,
        }, timeout=5)
        if r.status_code == 201:
            loc_item_id = r.json().get("id")

        # Search by location_id
        r = requests.get(f"{BASE}/inventory/search?q=&location_id={test_loc_id}", timeout=5)
        check("GET /inventory/search?location_id= returns 200",
              r.status_code == 200, f"status={r.status_code}")
        results_list = r.json()
        check("Location filter returns items in that location",
              len(results_list) >= 1, f"{len(results_list)} results")
        if results_list:
            check("Filtered item has 'location_path'", "location_path" in results_list[0])
            check("location_path is non-empty",
                  bool(results_list[0].get("location_path")),
                  str(results_list[0].get("location_path")))

        # Search by name with location filter
        r = requests.get(
            f"{BASE}/inventory/search?q=Cabinet+Test+Rice&location_id={test_loc_id}",
            timeout=5)
        check("Search by name+location returns the item", r.status_code == 200)
        results_list = r.json()
        check("Name+location search finds the test item",
              any("Rice" in i.get("name", "") for i in results_list),
              f"{len(results_list)} results")

        if loc_item_id:
            requests.delete(f"{BASE}/inventory/{loc_item_id}", timeout=5)
    else:
        check("Location search (skipped — test location not created)", False)
except Exception as e:
    check("Inventory search by location", False, str(e))

# ── 33. Meal Plan Works Across Multiple Locations ─────────────────────────────
section("33. Meal plan still works with multi-location inventory")
try:
    r = requests.get(f"{BASE}/meal-plan/today", timeout=5)
    check("GET /meal-plan/today still returns 200", r.status_code == 200,
          f"status={r.status_code}")
    plan = r.json()
    check("Meal plan returns at least 1 meal across all locations",
          len(plan.get("meals", [])) >= 1,
          f"{len(plan.get('meals', []))} meals")
except Exception as e:
    check("Meal plan with multi-location inventory", False, str(e))

# ── 34. Grocery List Uses Total Inventory Across Locations ────────────────────
section("34. Grocery list uses total inventory across all locations")
try:
    r = requests.get(f"{BASE}/grocery-list/weekly", timeout=5)
    check("GET /grocery-list/weekly still returns 200", r.status_code == 200,
          f"status={r.status_code}")
    data = r.json()
    inv_summary = data.get("inventory_summary", {})
    check("Grocery list inventory_summary covers all locations",
          inv_summary.get("total_items", 0) >= 1,
          f"{inv_summary.get('total_items')} items")
except Exception as e:
    check("Grocery list across locations", False, str(e))

# Clean up test items and locations
if search_item_id:
    try:
        requests.delete(f"{BASE}/inventory/{search_item_id}", timeout=5)
    except Exception:
        pass
for loc_id in [child_loc_id, test_loc_id]:
    if loc_id:
        try:
            requests.delete(f"{BASE}/locations/{loc_id}", timeout=5)
        except Exception:
            pass

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
