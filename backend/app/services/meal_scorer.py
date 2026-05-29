"""
Meal scoring service.
Scores a meal template against the user's current state and preferences.
Returns a score (0–100), a breakdown dict, and a human-readable explanation.
"""

from typing import Dict, List, Optional

from app.services.expiration_engine import get_expiration_risk

_CUISINE_MATCH = 10       # points for matching cuisine preference
_DIET_MATCH = 15          # points for matching diet style
_COOKING_TIME_MATCH = 8   # points for matching cooking time
_PROTEIN_GAP = 20         # max points for helping protein gap
_CALORIE_FIT = 15         # max points for fitting calorie budget
_URGENCY = 25             # max points for using urgent ingredients
_VARIETY = 7              # max points for ingredient variety

_DISLIKE_PENALTY = 25     # points deducted if a disliked food appears


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
    matched_items: List,        # inventory items assigned to this meal
    user,
    remaining_macros: Dict,
    estimated_macros: Dict,
) -> Dict:
    """
    Score a (template, matched_items) pair for this user.

    Returns:
        {
          "total": float,          # 0–100
          "breakdown": {
              "urgency": float,
              "protein_gap": float,
              "calorie_fit": float,
              "preference": float,
              "cooking_time": float,
              "variety": float,
              "dislike_penalty": float,
          },
          "explanation": str,
        }
    """
    breakdown: Dict[str, float] = {
        "urgency": 0.0,
        "protein_gap": 0.0,
        "calorie_fit": 0.0,
        "preference": 0.0,
        "cooking_time": 0.0,
        "variety": 0.0,
        "dislike_penalty": 0.0,
    }
    reasons: List[str] = []

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
            # Score highest when meal uses 20–60 % of remaining budget
            if 0.15 <= ratio <= 0.65:
                breakdown["calorie_fit"] = _CALORIE_FIT
            elif ratio < 0.15:
                breakdown["calorie_fit"] = round(_CALORIE_FIT * (ratio / 0.15), 1)
            else:
                breakdown["calorie_fit"] = round(_CALORIE_FIT * (1 - (ratio - 0.65) / 0.35), 1)
        else:
            # Exceeds remaining — penalty proportional to overshoot
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
    elif cuisine_pref in ("mixed", "no_preference") or not cuisine_pref:
        pref_score += _CUISINE_MATCH // 2  # neutral bonus

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
    raw_dislikes = getattr(user, "disliked_foods", None)
    dislikes: List[str] = []
    if isinstance(raw_dislikes, list):
        dislikes = [d.lower() for d in raw_dislikes]
    elif isinstance(raw_dislikes, str):
        import json
        try:
            dislikes = [d.lower() for d in json.loads(raw_dislikes)]
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

    # ── Total ───────────────────────────────────────────────────────────────
    total = sum(breakdown.values())
    total = round(max(0.0, min(100.0, total)), 1)

    explanation = (
        "; ".join(reasons)
        if reasons
        else "selected based on ingredient availability"
    )

    return {
        "total": total,
        "breakdown": breakdown,
        "explanation": explanation.capitalize() + ".",
    }
