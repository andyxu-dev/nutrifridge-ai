from datetime import date
from typing import Dict, List, Optional

from app.services.expiration_engine import get_expiration_risk, RISK_ORDER
from app.services.nutrition_engine import calculate_nutrition_target
from app.services.meal_templates import get_templates_for_meal_type
from app.services.meal_scorer import score_meal

_DEFAULT_SERVING_G = 150


def _macros(item, grams: float = _DEFAULT_SERVING_G) -> Dict:
    f = grams / 100
    return {
        "calories":  round((item.calories_per_100g  or 0) * f, 1),
        "protein_g": round((item.protein_per_100g   or 0) * f, 1),
        "carbs_g":   round((item.carbs_per_100g     or 0) * f, 1),
        "fat_g":     round((item.fat_per_100g       or 0) * f, 1),
    }


def _match_items_to_template(template: dict, inventory: List, used_ids: set) -> List:
    """Return the best inventory items for this template."""
    preferred = template["preferred_categories"]
    required = template["required_categories"]

    # Build a pool: items not yet used, sorted by expiration urgency
    available = sorted(
        [i for i in inventory if i.id not in used_ids],
        key=lambda i: RISK_ORDER.get(get_expiration_risk(i.best_before_date), 4),
    )

    # Check at least one required category is present
    available_cats = {i.category for i in available}
    if not any(cat in available_cats for cat in required):
        return []

    selected: List = []
    used_cat_slots: List[str] = []

    # Fill slots in preferred-category order
    for cat in preferred:
        candidates = [i for i in available if i.category == cat and i.id not in {x.id for x in selected}]
        if candidates:
            # Pick the most urgent
            selected.append(candidates[0])
            used_cat_slots.append(cat)
        if len(selected) >= 3:
            break

    # If we got nothing, fall back to most-urgent items
    if not selected:
        selected = available[:3]

    return selected


def _build_meal_from_template(
    template: dict,
    matched_items: List,
    user,
    remaining: Dict,
) -> Dict:
    """Assemble a full meal dict from template + matched inventory items."""
    total: Dict[str, float] = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    ingredients = []
    urgent_used = []

    for item in matched_items:
        risk = get_expiration_risk(item.best_before_date)
        m = _macros(item)
        for k in total:
            total[k] = round(total[k] + m[k], 1)

        ing_reason = "available in inventory"
        if risk in ("expired", "high"):
            ing_reason = "high expiration risk — use now"
            urgent_used.append(item.name)
        elif risk == "medium":
            ing_reason = "expiring soon"

        ingredients.append({
            "inventory_item_id": item.id,
            "name": item.name,
            "quantity_used": _DEFAULT_SERVING_G,
            "unit": "g",
            "reason": ing_reason,
            "expiration_risk": risk,
        })

    score_result = score_meal(template, matched_items, user, remaining, total)

    return {
        "meal_type": template["meal_type"],
        "name": template["name"],
        "cuisine": template["cuisine"],
        "cooking_time_minutes": template["cooking_time_minutes"],
        "ingredients": ingredients,
        "estimated_macros": {k: round(v, 1) for k, v in total.items()},
        "reason": score_result["explanation"],
        "macro_gap_helped": _macro_gap_helped(total, remaining),
        "urgent_ingredients_used": urgent_used,
        "score": score_result["total"],
        "score_breakdown": score_result["breakdown"],
        "instructions": template["instructions"],
        "tags": template.get("tags", []),
        "excluded": score_result.get("excluded", False),
    }


def _macro_gap_helped(meal_macros: Dict, remaining: Dict) -> List[str]:
    helped = set()
    if meal_macros.get("calories", 0) > 50:
        helped.add("calories")
    if remaining.get("protein_g", 0) > 10 and meal_macros.get("protein_g", 0) > 5:
        helped.add("protein")
    if meal_macros.get("carbs_g", 0) > 10:
        helped.add("carbs")
    if meal_macros.get("fat_g", 0) > 3:
        helped.add("fat")
    return sorted(helped)


def generate_meal_plan(
    user,
    inventory_items: List,
    remaining_macros: Optional[Dict] = None,
    consumed: Optional[Dict] = None,
) -> Dict:
    target = calculate_nutrition_target(user)

    if remaining_macros is None:
        remaining_macros = {k: target[k] for k in ["calories", "protein_g", "carbs_g", "fat_g"]}
    if consumed is None:
        consumed = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}

    cal_remaining = remaining_macros.get("calories", 0)
    meal_types = ["breakfast", "lunch", "dinner", "snack"]
    if cal_remaining < 100:
        meal_types = []

    used_ids: set = set()
    meals: List[Dict] = []

    for mt in meal_types:
        templates = get_templates_for_meal_type(mt)
        if not templates:
            continue

        best_meal: Optional[Dict] = None
        best_score = -1.0

        for tmpl in templates:
            matched = _match_items_to_template(tmpl, inventory_items, used_ids)
            if not matched:
                continue
            candidate = _build_meal_from_template(tmpl, matched, user, remaining_macros)
            if candidate.get("excluded", False):
                continue  # skip hard allergy/avoidance exclusions
            if candidate["score"] > best_score:
                best_score = candidate["score"]
                best_meal = candidate

        if best_meal:
            meals.append(best_meal)
            for ing in best_meal["ingredients"]:
                used_ids.add(ing["inventory_item_id"])

    # Plan totals
    plan_total: Dict[str, float] = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for meal in meals:
        for k in plan_total:
            plan_total[k] += meal["estimated_macros"].get(k, 0)

    # Recommendation summary
    urgent_names = [
        i.name for i in sorted(
            inventory_items,
            key=lambda i: RISK_ORDER.get(get_expiration_risk(i.best_before_date), 4),
        )
        if get_expiration_risk(i.best_before_date) in ("expired", "high", "medium")
    ][:3]

    gap_parts = []
    if remaining_macros.get("protein_g", 0) > 10:
        gap_parts.append(f'{round(remaining_macros["protein_g"])}g protein')
    if remaining_macros.get("calories", 0) > 100:
        gap_parts.append(f'{round(remaining_macros["calories"])} kcal')

    summary_parts = []
    if gap_parts:
        summary_parts.append(f'You still need {" and ".join(gap_parts)} today')
    if urgent_names:
        summary_parts.append(
            f'The plan prioritises {", ".join(urgent_names)} because they expire soon'
        )
    if not summary_parts:
        summary_parts.append("You are on track — great job today!")

    return {
        "date": str(date.today()),
        "target": target,
        "consumed": consumed,
        "remaining": {k: round(v, 1) for k, v in remaining_macros.items()},
        "meals": meals,
        "daily_estimated_total": {k: round(v, 1) for k, v in plan_total.items()},
        "recommendation_summary": ". ".join(summary_parts) + ".",
    }
