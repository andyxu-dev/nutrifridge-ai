"""
GET /grocery-list/weekly

Analyses current inventory, nutrition targets, and user preferences to
recommend what to buy this week.
"""
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.inventory import InventoryItem
from app.models.nutrition_log import DailyLog
from app.services.nutrition_engine import calculate_nutrition_target
from app.services.expiration_engine import get_expiration_risk

router = APIRouter(prefix="/grocery-list", tags=["grocery-list"])

# ── Pantry staples per cuisine / diet preference ──────────────────────────────

_CHINESE_STAPLES = [
    ("Chicken Breast", "meat", "lean protein, great for stir-fries"),
    ("Tofu", "other", "versatile plant protein for Chinese dishes"),
    ("Bok Choy", "vegetable", "classic Chinese green vegetable"),
    ("Jasmine Rice", "grain", "staple grain for Chinese meals"),
    ("Garlic", "condiment", "essential flavour base for stir-fries"),
    ("Soy Sauce", "condiment", "key seasoning for Chinese cuisine"),
    ("Eggs", "other", "versatile and fast — tomato egg stir-fry, congee topping"),
    ("Broccoli", "vegetable", "pairs well with beef or shrimp"),
]

_WESTERN_STAPLES = [
    ("Chicken Breast", "meat", "lean protein for grilling, baking, or salads"),
    ("Salmon", "meat", "omega-3 rich — great for salad bowls"),
    ("Greek Yogurt", "dairy", "high protein, works as breakfast or snack"),
    ("Eggs", "other", "essential for omelettes, scrambled eggs, and toast"),
    ("Spinach", "vegetable", "great for omelettes and salads"),
    ("Oats", "grain", "quick, filling breakfast base"),
    ("Avocado", "fruit", "healthy fat for toast and salads"),
    ("Whole Grain Bread", "grain", "toast base for multiple Western breakfast options"),
]

_HIGH_PROTEIN_STAPLES = [
    ("Chicken Breast", "meat", "the highest protein-per-calorie meat"),
    ("Tuna", "meat", "convenient canned protein source"),
    ("Greek Yogurt", "dairy", "10g protein per 100g"),
    ("Eggs", "other", "13g protein per 100g, complete amino acid profile"),
    ("Beef", "meat", "26g protein per 100g — great for bulking"),
    ("Salmon", "meat", "20g protein plus beneficial fats"),
]

_LOW_CARB_STAPLES = [
    ("Chicken Breast", "meat", "zero carbs, lean protein"),
    ("Salmon", "meat", "zero carbs, healthy fats"),
    ("Spinach", "vegetable", "3.6g carbs per 100g — very low"),
    ("Eggs", "other", "minimal carbs, high protein"),
    ("Avocado", "fruit", "healthy fats, low net carbs"),
    ("Broccoli", "vegetable", "7g carbs per 100g with high fibre"),
]

_LOW_FAT_STAPLES = [
    ("Chicken Breast", "meat", "only 3.6g fat per 100g"),
    ("Tuna in water", "meat", "1g fat per 100g"),
    ("Greek Yogurt (non-fat)", "dairy", "0.4g fat per 100g"),
    ("Shrimp", "meat", "0.3g fat per 100g — extremely lean"),
    ("Cooked Rice", "grain", "0.3g fat per 100g"),
    ("Spinach", "vegetable", "0.4g fat per 100g"),
]


def _get_staples(user) -> list:
    cuisine = getattr(user, "cuisine_preference", None) or "no_preference"
    diet = getattr(user, "diet_style", None) or "no_preference"

    if cuisine == "chinese":
        base = list(_CHINESE_STAPLES)
    elif cuisine == "western":
        base = list(_WESTERN_STAPLES)
    else:
        # Mix: alternate chinese/western staples
        base = [
            item for pair in zip(_CHINESE_STAPLES, _WESTERN_STAPLES)
            for item in pair
        ][:8]

    # Overlay diet-style specific staples
    if diet == "high_protein":
        extras = [s for s in _HIGH_PROTEIN_STAPLES if not any(s[0].lower() == b[0].lower() for b in base)]
        base = base[:5] + extras[:3]
    elif diet == "low_carb":
        extras = [s for s in _LOW_CARB_STAPLES if not any(s[0].lower() == b[0].lower() for b in base)]
        base = base[:5] + extras[:3]
    elif diet == "low_fat":
        extras = [s for s in _LOW_FAT_STAPLES if not any(s[0].lower() == b[0].lower() for b in base)]
        base = base[:5] + extras[:3]

    return base


def _is_low_stock(item: InventoryItem) -> bool:
    """Item quantity is low enough to warrant restocking."""
    if item.unit in ("g", "ml"):
        return item.quantity < 200
    if item.unit in ("kg", "l"):
        return item.quantity < 0.5
    if item.unit in ("lb", "lbs"):
        return item.quantity < 0.5
    if item.unit == "count":
        return item.quantity <= 2
    return item.quantity <= 1  # bag, cup, etc.


@router.get("/weekly")
def get_weekly_grocery_list(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found. Create a profile first.")

    inventory = db.query(InventoryItem).all()
    target = calculate_nutrition_target(user)

    # ── Inventory summary ─────────────────────────────────────────────────
    urgent = [i for i in inventory if get_expiration_risk(i.best_before_date) in ("expired", "high")]
    medium_risk = [i for i in inventory if get_expiration_risk(i.best_before_date) == "medium"]
    low_stock = [i for i in inventory if _is_low_stock(i) and get_expiration_risk(i.best_before_date) not in ("expired", "high")]
    present_categories = {i.category for i in inventory}

    inventory_summary = {
        "total_items": len(inventory),
        "urgent_count": len(urgent),
        "medium_risk_count": len(medium_risk),
        "low_stock_count": len(low_stock),
        "categories_present": sorted(present_categories),
    }

    # ── Nutrition gap analysis ────────────────────────────────────────────
    # Look at today's log if available
    daily_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    if daily_log:
        cal_consumed = daily_log.calories_consumed
        protein_consumed = daily_log.protein_consumed_g
    else:
        cal_consumed = 0.0
        protein_consumed = 0.0

    protein_gap_g = max(0.0, round(target["protein_g"] - protein_consumed, 1))
    cal_gap = max(0, round(target["calories"] - cal_consumed))

    # Check if inventory is protein-rich enough to cover target
    total_protein_available = sum(
        (i.protein_per_100g or 0) * i.quantity / 100
        for i in inventory
        if i.unit in ("g",) and (i.protein_per_100g or 0) > 5
    )
    protein_low = total_protein_available < target["protein_g"] * 2  # less than 2 days of protein

    diet_style = getattr(user, "diet_style", None) or "no_preference"
    if diet_style == "high_protein":
        gap_analysis = f"Your target is {target['protein_g']}g protein/day. {'Stock up on lean proteins.' if protein_low else 'Protein inventory looks adequate.'} Calorie target: {target['calories']} kcal."
    elif diet_style == "low_carb":
        gap_analysis = f"Low-carb goal: stay under {round(target['carbs_g'])}g carbs/day. Focus on lean proteins and non-starchy vegetables."
    elif diet_style == "low_fat":
        gap_analysis = f"Low-fat goal: target {round(target['fat_g'])}g fat/day. Choose lean meats, non-fat dairy, and vegetables."
    else:
        gap_analysis = f"Balanced targets: {target['calories']} kcal, {target['protein_g']}g protein, {target['carbs_g']}g carbs, {target['fat_g']}g fat per day."

    nutrition_gap_summary = {
        "protein_gap_today_g": protein_gap_g,
        "calorie_gap_today": cal_gap,
        "protein_low_in_inventory": protein_low,
        "analysis": gap_analysis,
    }

    # ── Avoid buying ──────────────────────────────────────────────────────
    avoid_buying = []
    for item in urgent + medium_risk:
        avoid_buying.append({
            "name": item.name,
            "reason": f"You already have {item.quantity} {item.unit} — use it before buying more ({get_expiration_risk(item.best_before_date)} risk).",
        })

    # ── Recommend to buy ──────────────────────────────────────────────────
    staples = _get_staples(user)
    present_names_lower = {i.name.lower() for i in inventory}

    # De-duplicate disliked foods
    raw_dislikes = getattr(user, "disliked_foods", None)
    dislikes: list = []
    if isinstance(raw_dislikes, str):
        try:
            dislikes = [d.lower() for d in json.loads(raw_dislikes)]
        except Exception:
            pass
    elif isinstance(raw_dislikes, list):
        dislikes = [d.lower() for d in raw_dislikes]

    recommended_to_buy = []

    # 1. Low-stock items
    for item in low_stock:
        recommended_to_buy.append({
            "name": item.name,
            "category": item.category,
            "reason": f"Running low ({item.quantity} {item.unit} remaining).",
            "priority": "high",
        })

    # 2. Missing protein sources if protein-low
    if protein_low and "meat" not in present_categories:
        recommended_to_buy.append({
            "name": "Chicken Breast",
            "category": "meat",
            "reason": "No protein source in inventory — needed to meet daily protein target.",
            "priority": "high",
        })

    # 3. Staple recommendations
    for name, category, reason in staples:
        name_lower = name.lower()
        if any(name_lower in p or p in name_lower for p in present_names_lower):
            continue  # already have it
        if any(d in name_lower or name_lower in d for d in dislikes):
            continue  # user dislikes it
        if any(r["name"].lower() == name_lower for r in recommended_to_buy):
            continue  # already added
        recommended_to_buy.append({
            "name": name,
            "category": category,
            "reason": reason,
            "priority": "medium",
        })

    # Cap the list to keep it readable
    recommended_to_buy = recommended_to_buy[:12]

    return {
        "recommended_to_buy": recommended_to_buy,
        "avoid_buying": avoid_buying,
        "nutrition_gap_summary": nutrition_gap_summary,
        "inventory_summary": inventory_summary,
    }
