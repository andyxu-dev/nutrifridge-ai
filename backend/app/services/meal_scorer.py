"""
Meal scoring service.
Scores a meal template against the user's current state and preferences.
Returns a score (0–100), a breakdown dict, a human-readable explanation,
and an 'excluded' flag for hard-excluded meals.
"""

from typing import Dict, List, Optional

from app.services.expiration_engine import get_expiration_risk

_CUISINE_MATCH = 10
_DIET_MATCH = 15
_COOKING_TIME_MATCH = 8
_PROTEIN_GAP = 20
_CALORIE_FIT = 15
_URGENCY = 25
_VARIETY = 7
_HEALTH_CONSTRAINT_MAX = 30

_DISLIKE_PENALTY = 25


def _cooking_time_ok(template_minutes: int, preference: Optional[str]) -> bool:
    if not preference or preference == "flexible":
        return True
    if preference == "quick_15_min":
        return template_minutes <= 15
    if preference == "normal_30_min":
        return template_minutes <= 35
    return True


def score_meal(
    template: dict,
    matched_items: List,
    user,
    remaining_macros: Dict,
    estimated_macros: Dict,
) -> Dict:
    """
    Score a (template, matched_items) pair for this user.

    Returns:
        {
          "total": float,      # 0–100
          "excluded": bool,    # True if hard allergy/avoidance exclusion triggered
          "breakdown": {
              "urgency": float,
              "protein_gap": float,
              "calorie_fit": float,
              "preference": float,
              "cooking_time": float,
              "variety": float,
              "dislike_penalty": float,
              "health_constraint_score": float,
              "allergy_exclusion": float,   # 0 normally, -100 if excluded
          },
          "explanation": str,
        }
    """
    from app.services.health_constraint_engine import get_hard_excluded_foods, get_tag_penalties

    breakdown: Dict[str, float] = {
        "urgency": 0.0,
        "protein_gap": 0.0,
        "calorie_fit": 0.0,
        "preference": 0.0,
        "cooking_time": 0.0,
        "variety": 0.0,
        "dislike_penalty": 0.0,
        "health_constraint_score": 0.0,
        "allergy_exclusion": 0.0,
    }
    reasons: List[str] = []

    # ── 0. Hard exclusion check ─────────────────────────────────────────────
    hard_excluded = get_hard_excluded_foods(user)
    if hard_excluded and matched_items:
        excluded_items = [
            i.name for i in matched_items
            if any(ex in i.name.lower() for ex in hard_excluded)
        ]
        if excluded_items:
            breakdown["allergy_exclusion"] = -100.0
            return {
                "total": 0.0,
                "excluded": True,
                "breakdown": breakdown,
                "explanation": (
                    f"Excluded: contains {', '.join(excluded_items)} "
                    "(allergy or avoidance restriction)."
                ),
            }

    # ── 1. Urgency score ────────────────────────────────────────────────────
    if matched_items:
        urgent_count = sum(
            1 for i in matched_items
            if get_expiration_risk(i.best_before_date) in ("expired", "high", "medium")
        )
        urgency_ratio = urgent_count / len(matched_items)
        breakdown["urgency"] = round(_URGENCY * urgency_ratio, 1)
        if urgent_count > 0:
            reasons.append(f"uses {urgent_count} expiring ingredient(s)")

    # ── 2. Protein gap score ────────────────────────────────────────────────
    protein_gap = remaining_macros.get("protein_g", 0)
    meal_protein = estimated_macros.get("protein_g", 0)
    if protein_gap > 5:
        ratio = min(1.0, meal_protein / protein_gap)
        breakdown["protein_gap"] = round(_PROTEIN_GAP * ratio, 1)
        if ratio > 0.2:
            reasons.append(f"provides {round(meal_protein)}g protein toward {round(protein_gap)}g gap")

    # ── 3. Calorie fit score ────────────────────────────────────────────────
    cal_remaining = remaining_macros.get("calories", 9999)
    meal_cal = estimated_macros.get("calories", 0)
    if cal_remaining > 0 and meal_cal > 0:
        ratio = meal_cal / cal_remaining
        if ratio <= 1.0:
            if 0.15 <= ratio <= 0.65:
                breakdown["calorie_fit"] = _CALORIE_FIT
            elif ratio < 0.15:
                breakdown["calorie_fit"] = round(_CALORIE_FIT * (ratio / 0.15), 1)
            else:
                breakdown["calorie_fit"] = round(_CALORIE_FIT * (1 - (ratio - 0.65) / 0.35), 1)
        else:
            overshoot = (meal_cal - cal_remaining) / max(cal_remaining, 1)
            breakdown["calorie_fit"] = max(-10.0, round(-_CALORIE_FIT * min(overshoot, 1.0), 1))
            reasons.append("may exceed calorie budget")

    # ── 4. User preference score ────────────────────────────────────────────
    pref_score = 0.0
    cuisine_pref = getattr(user, "cuisine_preference", None)
    if cuisine_pref and cuisine_pref not in ("mixed", "no_preference"):
        if template.get("cuisine") == cuisine_pref:
            pref_score += _CUISINE_MATCH
            reasons.append(f"matches {cuisine_pref} cuisine preference")
        elif template.get("cuisine") == "any":
            pref_score += _CUISINE_MATCH // 2
    else:
        pref_score += _CUISINE_MATCH // 2

    diet_style = getattr(user, "diet_style", None)
    template_tags = template.get("tags", [])
    if diet_style and diet_style != "no_preference":
        if diet_style in template_tags:
            pref_score += _DIET_MATCH
            reasons.append(f"fits {diet_style.replace('_', ' ')} diet style")
        elif "balanced" in template_tags and diet_style == "balanced":
            pref_score += _DIET_MATCH

    breakdown["preference"] = round(min(pref_score, _CUISINE_MATCH + _DIET_MATCH), 1)

    # ── 5. Cooking time score ───────────────────────────────────────────────
    cooking_pref = getattr(user, "cooking_time_preference", None)
    if _cooking_time_ok(template.get("cooking_time_minutes", 30), cooking_pref):
        breakdown["cooking_time"] = _COOKING_TIME_MATCH
    else:
        breakdown["cooking_time"] = 0.0

    # ── 6. Variety score ────────────────────────────────────────────────────
    if matched_items:
        unique_cats = len({getattr(i, "category", "other") for i in matched_items})
        breakdown["variety"] = round(_VARIETY * min(1.0, unique_cats / 3), 1)

    # ── 7. Dislike penalty ──────────────────────────────────────────────────
    import json as _json
    raw_dislikes = getattr(user, "disliked_foods", None)
    dislikes: List[str] = []
    if isinstance(raw_dislikes, list):
        dislikes = [d.lower() for d in raw_dislikes]
    elif isinstance(raw_dislikes, str):
        try:
            dislikes = [d.lower() for d in _json.loads(raw_dislikes)]
        except Exception:
            pass

    if dislikes and matched_items:
        disliked_found = [
            i.name for i in matched_items
            if any(d in i.name.lower() or i.name.lower() in d for d in dislikes)
        ]
        if disliked_found:
            breakdown["dislike_penalty"] = -_DISLIKE_PENALTY
            reasons.append(f"contains disliked food: {', '.join(disliked_found)}")

    # ── 8. Health constraint score ──────────────────────────────────────────
    tag_penalties = get_tag_penalties(user)
    health_penalty = 0.0
    health_reasons: List[str] = []

    for tag, penalty in tag_penalties.items():
        if tag in template_tags:
            health_penalty += penalty
            health_reasons.append(f"{tag.replace('_', ' ')} penalty for health condition")

    # Also check macro_strategy alignment
    macro_strategy = getattr(user, "macro_strategy", None) or "standard"
    if macro_strategy == "low_carb" and "low_carb" in template_tags:
        health_penalty += 5.0  # small bonus for matching strategy
    elif macro_strategy == "high_protein" and "high_protein" in template_tags:
        health_penalty += 5.0

    breakdown["health_constraint_score"] = round(
        max(-_HEALTH_CONSTRAINT_MAX, min(_HEALTH_CONSTRAINT_MAX, health_penalty)), 1
    )
    if health_reasons:
        reasons.extend(health_reasons)

    # Also add health context to explanation when conditions present
    conditions_raw = getattr(user, "health_conditions", None)
    import json as _j
    conditions = []
    if isinstance(conditions_raw, list):
        conditions = conditions_raw
    elif isinstance(conditions_raw, str):
        try:
            conditions = _j.loads(conditions_raw)
        except Exception:
            pass

    if conditions and any(tag in template_tags for tag in ("high_protein", "low_carb", "balanced")):
        if "fatty_liver" in conditions:
            reasons.append("fits moderate-fat goal for fatty liver management")
        if "diabetes" in conditions or "prediabetes" in conditions:
            if "low_carb" in template_tags or "high_protein" in template_tags:
                reasons.append("low-carb/high-protein profile supports blood sugar management")

    # ── Total ───────────────────────────────────────────────────────────────
    total = sum(breakdown.values())
    total = round(max(0.0, min(100.0, total)), 1)

    explanation = (
        "; ".join(reasons) if reasons else "selected based on ingredient availability"
    )

    return {
        "total": total,
        "excluded": False,
        "breakdown": breakdown,
        "explanation": explanation.capitalize() + ".",
    }
