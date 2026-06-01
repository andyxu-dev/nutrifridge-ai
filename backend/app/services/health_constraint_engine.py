"""
Health constraint engine — adjusts nutrition targets and meal scoring
based on user health conditions, allergies, and macro strategy.

DISCLAIMER: All outputs are estimates for planning purposes only,
not medical advice. Users with health conditions should consult a
qualified healthcare professional.
"""

import json
from typing import Dict, List, Set


_LACTOSE_KEYWORDS: Set[str] = {
    "milk", "yogurt", "yoghurt", "cheese", "butter", "cream", "whey",
}

_GLUTEN_KEYWORDS: Set[str] = {
    "bread", "pasta", "noodle", "wheat", "flour", "toast", "cereal",
    "bagel", "cracker", "croissant", "muffin", "biscuit",
}


def _parse_list(val) -> List[str]:
    """Parse JSON string, list, or None into a list of strings."""
    if val is None:
        return []
    if isinstance(val, list):
        return [str(v) for v in val]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return [str(v) for v in parsed] if isinstance(parsed, list) else []
        except (json.JSONDecodeError, ValueError):
            return []
    return []


def get_hard_excluded_foods(user) -> Set[str]:
    """
    Return lowercase food-name fragments that must never appear in recommendations.
    Includes allergies, strict_avoid_foods, lactose intolerance, gluten sensitivity.
    """
    excluded: Set[str] = set()

    for food in _parse_list(getattr(user, "allergies", None)):
        excluded.add(food.strip().lower())

    for food in _parse_list(getattr(user, "strict_avoid_foods", None)):
        excluded.add(food.strip().lower())

    conditions = _parse_list(getattr(user, "health_conditions", None))

    if "lactose_intolerance" in conditions:
        excluded.update(_LACTOSE_KEYWORDS)

    if "gluten_sensitivity" in conditions:
        excluded.update(_GLUTEN_KEYWORDS)

    excluded.discard("")
    return excluded


def get_tag_penalties(user) -> Dict[str, float]:
    """
    Return template tag → score penalty (negative numbers).
    Applied during meal scoring for matching template tags.
    """
    penalties: Dict[str, float] = {}
    conditions = _parse_list(getattr(user, "health_conditions", None))
    macro_strategy = getattr(user, "macro_strategy", None) or "standard"

    if "fatty_liver" in conditions:
        penalties["high_fat"] = penalties.get("high_fat", 0.0) - 15.0
        penalties["high_carb"] = penalties.get("high_carb", 0.0) - 10.0

    if "diabetes" in conditions or "prediabetes" in conditions:
        penalties["high_carb"] = penalties.get("high_carb", 0.0) - 15.0

    if "high_cholesterol" in conditions:
        penalties["high_fat"] = penalties.get("high_fat", 0.0) - 10.0

    if macro_strategy == "low_fat":
        penalties["high_fat"] = penalties.get("high_fat", 0.0) - 5.0

    return penalties


def adjust_nutrition_target(user, base_target: Dict) -> Dict:
    """
    Adjust the base nutrition target for health conditions and macro strategy.

    Returns:
        calories, protein_g, carbs_g, fat_g, adjustment_reasons, using_custom_targets
    """
    conditions = _parse_list(getattr(user, "health_conditions", None))
    macro_strategy = getattr(user, "macro_strategy", None) or "standard"

    calories = float(base_target["calories"])
    protein_g = float(base_target["protein_g"])
    carbs_g = float(base_target["carbs_g"])
    fat_g = float(base_target["fat_g"])
    tdee = float(base_target.get("tdee", calories))

    reasons: List[str] = []
    using_custom = False

    # ── Custom overrides (highest priority) ───────────────────────────────
    custom_cal   = getattr(user, "custom_calorie_target", None)
    custom_prot  = getattr(user, "custom_protein_g", None)
    custom_carbs = getattr(user, "custom_carbs_g", None)
    custom_fat   = getattr(user, "custom_fat_g", None)

    if macro_strategy == "custom" and any(
        v is not None for v in [custom_cal, custom_prot, custom_carbs, custom_fat]
    ):
        using_custom = True
        if custom_cal is not None:
            calories = float(custom_cal)
        if custom_prot is not None:
            protein_g = float(custom_prot)
        if custom_carbs is not None:
            carbs_g = float(custom_carbs)
        if custom_fat is not None:
            fat_g = float(custom_fat)
        reasons.append("using custom macro overrides")

    else:
        # ── Health condition adjustments ──────────────────────────────────
        if "fatty_liver" in conditions and getattr(user, "goal", "") == "muscle_gain":
            calories = round(tdee + 150)
            reasons.append(
                "calorie surplus reduced to +150 kcal (conservative for fatty liver)"
            )

        if "fatty_liver" in conditions or "high_cholesterol" in conditions:
            max_fat = (calories * 0.22) / 9
            if fat_g > max_fat:
                fat_g = max_fat
                reasons.append(
                    "fat limited to 22% of calories (fatty liver / high cholesterol)"
                )

        if "diabetes" in conditions or "prediabetes" in conditions:
            max_carbs = (calories * 0.40) / 4
            if carbs_g > max_carbs:
                carbs_g = max_carbs
                reasons.append(
                    "carbs limited to 40% of calories (diabetes / prediabetes management)"
                )

        if "kidney_disease" in conditions:
            weight_kg = float(getattr(user, "weight_kg", 70))
            max_prot = weight_kg * 0.8
            if protein_g > max_prot:
                protein_g = max_prot
                reasons.append(
                    "protein limited to 0.8g/kg (kidney disease — verify with a registered dietitian)"
                )

        if "hypertension" in conditions:
            reasons.append("limit high-sodium foods; no calorie adjustment applied")

        if "gout" in conditions:
            reasons.append("limit high-purine foods (organ meats, shellfish); no calorie adjustment")

        # ── Macro strategy adjustments ────────────────────────────────────
        if macro_strategy == "high_protein":
            weight_kg = float(getattr(user, "weight_kg", 70))
            new_prot = weight_kg * 2.2
            if new_prot > protein_g:
                protein_g = new_prot
                reasons.append("protein increased to 2.2g/kg (high-protein strategy)")

        elif macro_strategy == "low_carb":
            if carbs_g > 100:
                carbs_g = 100.0
                reasons.append("carbs capped at 100g (low-carb strategy)")

        elif macro_strategy == "moderate_carb":
            max_mc = (calories * 0.40) / 4
            if carbs_g > max_mc:
                carbs_g = max_mc
                reasons.append("carbs at 40% of calories (moderate-carb strategy)")

        elif macro_strategy == "low_fat":
            max_lf = (calories * 0.20) / 9
            if fat_g > max_lf:
                fat_g = max_lf
                reasons.append("fat at 20% of calories (low-fat strategy)")

        elif macro_strategy == "conservative_surplus":
            if getattr(user, "goal", "") == "muscle_gain" and "fatty_liver" not in conditions:
                calories = round(tdee + 150)
                reasons.append("conservative surplus: +150 kcal instead of +300")

    return {
        "calories": round(calories),
        "protein_g": round(protein_g, 1),
        "carbs_g": round(carbs_g, 1),
        "fat_g": round(fat_g, 1),
        "adjustment_reasons": reasons,
        "using_custom_targets": using_custom,
    }


def get_health_mode_summary(user) -> str:
    """Return a plain-English summary of active health constraints."""
    conditions = _parse_list(getattr(user, "health_conditions", None))
    macro_strategy = getattr(user, "macro_strategy", None) or "standard"

    parts: List[str] = []
    if conditions:
        parts.append("Conditions: " + ", ".join(c.replace("_", " ") for c in conditions))
    if macro_strategy and macro_strategy not in ("standard", "custom"):
        parts.append("Strategy: " + macro_strategy.replace("_", " "))

    return " · ".join(parts) if parts else ""
