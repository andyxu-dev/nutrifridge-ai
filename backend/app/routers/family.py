"""
/family — Household management + family-aware meal planning and grocery lists.

Members can be the primary User profile (key="primary") or additional
FamilyMember records (key="member:{id}").
"""
import json
from datetime import date, datetime
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.household import FamilyMember, Household, HouseholdMealSchedule
from app.models.inventory import InventoryItem
from app.models.user import User
from app.schemas.household import (
    FamilyMemberCreate,
    FamilyMemberResponse,
    FamilyMemberUpdate,
)
from app.services.health_constraint_engine import get_hard_excluded_foods
from app.services.meal_planner import generate_meal_plan
from app.services.nutrition_engine import calculate_nutrition_target

router = APIRouter(prefix="/family", tags=["family"])


# ── Internal helpers ──────────────────────────────────────────────────────────

def _parse_json_list(val: Any) -> List[str]:
    """Parse a JSON string or list into a plain Python list of strings."""
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


def _serialize_json_list(val: Any) -> Optional[str]:
    """Convert a list (or JSON string) to a JSON string for DB storage."""
    if val is None:
        return None
    if isinstance(val, list):
        return json.dumps(val)
    if isinstance(val, str):
        # Validate it is valid JSON list; if so, re-dump for consistency
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return json.dumps(parsed)
        except (json.JSONDecodeError, ValueError):
            pass
        return json.dumps([val])  # treat bare string as single-element list
    return json.dumps([])


_JSON_LIST_FIELDS = [
    "health_conditions", "allergies", "strict_avoid_foods",
    "preferred_foods", "disliked_foods",
]


def _get_or_create_household(db: Session) -> Household:
    """Return the default household, creating one if none exists."""
    household = db.query(Household).first()
    if household:
        return household

    user = db.query(User).first()
    owner_id = user.id if user else 0
    household = Household(name="My Household", owner_user_id=owner_id)
    db.add(household)
    db.commit()
    db.refresh(household)
    return household


def _member_as_user_like(member: FamilyMember) -> SimpleNamespace:
    """
    Wrap a FamilyMember as a SimpleNamespace that satisfies the interface
    expected by calculate_nutrition_target() and health_constraint_engine
    functions.  Missing fields fall back to sensible defaults.
    """
    return SimpleNamespace(
        # BMR fields
        sex=member.sex or "male",
        age=member.age or 30,
        weight_kg=member.weight_kg or 70.0,
        height_cm=member.height_cm or 170.0,
        activity_level=member.activity_level or "moderate",
        goal=member.goal or "maintenance",
        # Health constraint fields
        health_conditions=member.health_conditions or "[]",
        allergies=member.allergies or "[]",
        strict_avoid_foods=member.strict_avoid_foods or "[]",
        macro_strategy=member.macro_strategy or "standard",
        custom_calorie_target=member.custom_calorie_target,
        custom_protein_g=member.custom_protein_g,
        custom_carbs_g=member.custom_carbs_g,
        custom_fat_g=member.custom_fat_g,
        # Preference fields (used by meal scorer / grocery list)
        dietary_preference=member.dietary_preference,
        cuisine_preference=member.cuisine_preference,
        cooking_time_preference=member.cooking_time_preference,
        diet_style=member.diet_style,
        preferred_foods=member.preferred_foods or "[]",
        disliked_foods=member.disliked_foods or "[]",
    )


def _user_as_member_dict(user: User) -> Dict:
    """Serialise a primary User to the member dict format used in GET /family."""
    return {
        "member_key": "primary",
        "name": user.name,
        "relationship_label": "primary",
        "goal": user.goal,
        "activity_level": user.activity_level,
        "sex": user.sex,
        "age": user.age,
        "weight_kg": user.weight_kg,
        "height_cm": user.height_cm,
        "health_conditions": _parse_json_list(user.health_conditions),
        "allergies": _parse_json_list(user.allergies),
        "strict_avoid_foods": _parse_json_list(user.strict_avoid_foods),
        "dietary_preference": user.dietary_preference,
        "cuisine_preference": user.cuisine_preference,
        "cooking_time_preference": user.cooking_time_preference,
        "diet_style": user.diet_style,
        "preferred_foods": _parse_json_list(user.preferred_foods),
        "disliked_foods": _parse_json_list(user.disliked_foods),
        "macro_strategy": user.macro_strategy,
        "custom_calorie_target": user.custom_calorie_target,
        "custom_protein_g": user.custom_protein_g,
        "custom_carbs_g": user.custom_carbs_g,
        "custom_fat_g": user.custom_fat_g,
        "is_active": True,
        "source": "primary_profile",
    }


def _member_db_to_dict(m: FamilyMember) -> Dict:
    """Serialise a FamilyMember ORM object with JSON list fields parsed."""
    return {
        "id": m.id,
        "household_id": m.household_id,
        "member_key": f"member:{m.id}",
        "name": m.name,
        "relationship_label": m.relationship_label,
        "goal": m.goal,
        "activity_level": m.activity_level,
        "sex": m.sex,
        "age": m.age,
        "weight_kg": m.weight_kg,
        "height_cm": m.height_cm,
        "health_conditions": _parse_json_list(m.health_conditions),
        "allergies": _parse_json_list(m.allergies),
        "strict_avoid_foods": _parse_json_list(m.strict_avoid_foods),
        "dietary_preference": m.dietary_preference,
        "cuisine_preference": m.cuisine_preference,
        "cooking_time_preference": m.cooking_time_preference,
        "diet_style": m.diet_style,
        "preferred_foods": _parse_json_list(m.preferred_foods),
        "disliked_foods": _parse_json_list(m.disliked_foods),
        "macro_strategy": m.macro_strategy,
        "custom_calorie_target": m.custom_calorie_target,
        "custom_protein_g": m.custom_protein_g,
        "custom_carbs_g": m.custom_carbs_g,
        "custom_fat_g": m.custom_fat_g,
        "is_active": m.is_active,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
        "source": "family_member",
    }


def _resolve_member(
    member_key: str,
    db: Session,
    household: Household,
) -> Tuple[Any, str, str]:
    """
    Resolve a member_key to (user_like_obj, member_name, member_key).
    Raises HTTPException if not found.
    """
    if member_key == "primary":
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=404, detail="Primary profile not found")
        return user, user.name, "primary"

    if member_key.startswith("member:"):
        try:
            member_id = int(member_key.split(":", 1)[1])
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail=f"Invalid member_key: {member_key}")
        member = db.query(FamilyMember).filter(
            FamilyMember.id == member_id,
            FamilyMember.household_id == household.id,
        ).first()
        if not member:
            raise HTTPException(status_code=404, detail=f"Family member {member_id} not found")
        return _member_as_user_like(member), member.name, member_key

    raise HTTPException(status_code=400, detail=f"Unknown member_key format: {member_key}")


def _portion_for_member(
    member_key: str,
    member_name: str,
    member_target: Dict,
    meal_macros: Dict,
    combined_calories: float,
    member_obj: Any,
) -> Dict:
    """
    Scale a household-combined meal down to an individual member's portion.
    Returns estimated macros, portion guidance text, and a short reason.
    """
    combined_calories = max(combined_calories, 1.0)
    ratio = member_target["calories"] / combined_calories

    # Goal-based macro multipliers
    goal = getattr(member_obj, "goal", "maintenance") or "maintenance"
    if goal == "muscle_gain":
        carb_mult = 1.2
        prot_mult = 1.1
    elif goal == "fat_loss":
        carb_mult = 0.7
        prot_mult = 1.1
    else:
        carb_mult = 1.0
        prot_mult = 1.0
    fat_mult = 1.0

    # Health condition tweaks
    conditions = _parse_json_list(getattr(member_obj, "health_conditions", "[]"))
    if "diabetes" in conditions or "prediabetes" in conditions:
        carb_mult *= 0.65
    if "fatty_liver" in conditions:
        fat_mult = 0.8

    estimated = {
        "calories": round(meal_macros.get("calories", 0) * ratio),
        "protein_g": round(meal_macros.get("protein_g", 0) * ratio * prot_mult, 1),
        "carbs_g": round(meal_macros.get("carbs_g", 0) * ratio * carb_mult, 1),
        "fat_g": round(meal_macros.get("fat_g", 0) * ratio * fat_mult, 1),
    }

    # Guidance text
    if goal == "muscle_gain":
        guidance = "Larger portions with extra carbs and protein to support muscle building."
        reason = "Muscle gain goal: increased carb and protein allocation."
    elif goal == "fat_loss":
        guidance = "Smaller carb portions. Focus on lean protein and vegetables."
        reason = "Fat loss goal: reduced carbs, maintained protein."
    else:
        guidance = "Moderate portions. Focus on lean protein and vegetables."
        reason = "Maintenance goal: balanced portions."

    if "diabetes" in conditions or "prediabetes" in conditions:
        guidance += " Limit carb intake; distribute evenly across meals."
        reason += " Carbs further reduced for blood sugar management."
    if "fatty_liver" in conditions:
        guidance += " Choose lower-fat cooking methods (steaming, baking)."
        reason += " Fat reduced for fatty liver management."

    return {
        "member_key": member_key,
        "member_name": member_name,
        "estimated_macros": estimated,
        "portion_guidance": guidance,
        "reason": reason,
    }


def _build_conflict_notes(
    selected_members: List[Dict],
) -> List[str]:
    """Identify nutritional conflicts among the selected household members."""
    notes: List[str] = []
    goals = [m.get("goal") or "maintenance" for m in selected_members]
    conditions_union: Set[str] = set()
    for m in selected_members:
        conds = m.get("health_conditions") or []
        if isinstance(conds, list):
            conditions_union.update(conds)

    has_fat_loss = "fat_loss" in goals
    has_muscle = "muscle_gain" in goals
    has_diabetes = "diabetes" in conditions_union or "prediabetes" in conditions_union
    has_fatty_liver = "fatty_liver" in conditions_union

    if has_fat_loss and has_muscle:
        notes.append(
            "Members have conflicting goals (fat loss vs. muscle gain). "
            "Consider serving starchy carbs (rice, bread) separately so each "
            "member can control their portion independently."
        )
    if has_diabetes:
        notes.append(
            "One or more members have diabetes/prediabetes. "
            "Serve rice, bread, and other high-GI carbs in controlled portions "
            "and avoid sugary sauces."
        )
    if has_fatty_liver:
        notes.append(
            "One or more members have fatty liver. "
            "Use lower-fat cooking methods (steaming, baking) and limit "
            "added oils to 1–2 tsp per serving."
        )
    if has_muscle and has_fatty_liver:
        notes.append(
            "Muscle-gain + fatty liver combination: use a conservative calorie "
            "surplus (+150 kcal) and prioritise lean proteins over fatty cuts."
        )

    return notes


def _build_health_allergy_notes(
    selected_members: List[Dict],
    all_excluded: Set[str],
) -> List[str]:
    notes: List[str] = []
    for m in selected_members:
        allergies = m.get("allergies") or []
        if isinstance(allergies, list) and allergies:
            notes.append(
                f"{m['name']} has allergies to: {', '.join(allergies)}. "
                "These ingredients have been excluded from the household meal plan."
            )
        strict = m.get("strict_avoid_foods") or []
        if isinstance(strict, list) and strict:
            notes.append(
                f"{m['name']} strictly avoids: {', '.join(strict)}."
            )
    if all_excluded:
        notes.append(
            f"Combined excluded foods for this household plan: {', '.join(sorted(all_excluded))}."
        )
    return notes


# ── Request schemas ───────────────────────────────────────────────────────────

class FamilyMealPlanRequest(BaseModel):
    member_keys: List[str]
    meal_date: Optional[str] = None


class FamilyGroceryRequest(BaseModel):
    member_keys: List[str]
    days_at_home: Optional[Dict[str, int]] = None


class ScheduleUpdateRequest(BaseModel):
    schedule: Dict[str, Dict[str, List[str]]]  # {schedule_type: {meal_type: [member_keys]}}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def get_household(db: Session = Depends(get_db)):
    """
    Return the default household with the primary profile and all additional members.
    """
    household = _get_or_create_household(db)
    user = db.query(User).first()
    members = (
        db.query(FamilyMember)
        .filter(FamilyMember.household_id == household.id)
        .order_by(FamilyMember.id)
        .all()
    )

    primary_member = _user_as_member_dict(user) if user else None
    additional_members = [_member_db_to_dict(m) for m in members]

    return {
        "household": {
            "id": household.id,
            "name": household.name,
            "owner_user_id": household.owner_user_id,
            "created_at": household.created_at,
            "updated_at": household.updated_at,
        },
        "primary_member": primary_member,
        "additional_members": additional_members,
    }


@router.post("/members", status_code=201)
def create_family_member(payload: FamilyMemberCreate, db: Session = Depends(get_db)):
    """Add a new family member to the default household."""
    household = _get_or_create_household(db)

    data = payload.model_dump()
    # Serialize JSON list fields to strings for storage
    for field in _JSON_LIST_FIELDS:
        data[field] = _serialize_json_list(data.get(field))

    member = FamilyMember(household_id=household.id, **data)
    db.add(member)
    db.commit()
    db.refresh(member)
    return _member_db_to_dict(member)


@router.get("/members")
def list_family_members(db: Session = Depends(get_db)):
    """Return all family members for the default household (JSON lists deserialized)."""
    household = _get_or_create_household(db)
    members = (
        db.query(FamilyMember)
        .filter(FamilyMember.household_id == household.id)
        .order_by(FamilyMember.id)
        .all()
    )
    return [_member_db_to_dict(m) for m in members]


@router.get("/members/{member_id}")
def get_family_member(member_id: int, db: Session = Depends(get_db)):
    """Return a single family member."""
    member = db.query(FamilyMember).filter(FamilyMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail=f"Family member {member_id} not found")
    return _member_db_to_dict(member)


@router.put("/members/{member_id}")
def update_family_member(
    member_id: int,
    payload: FamilyMemberUpdate,
    db: Session = Depends(get_db),
):
    """Update a family member's fields."""
    member = db.query(FamilyMember).filter(FamilyMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail=f"Family member {member_id} not found")

    update_data = payload.model_dump(exclude_unset=True)
    # Serialize any JSON list fields
    for field in _JSON_LIST_FIELDS:
        if field in update_data:
            update_data[field] = _serialize_json_list(update_data[field])

    for field, value in update_data.items():
        setattr(member, field, value)

    db.commit()
    db.refresh(member)
    return _member_db_to_dict(member)


@router.delete("/members/{member_id}")
def delete_family_member(member_id: int, db: Session = Depends(get_db)):
    """Delete a family member and remove them from all schedule slots."""
    member = db.query(FamilyMember).filter(FamilyMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail=f"Family member {member_id} not found")

    member_key = f"member:{member_id}"
    household = _get_or_create_household(db)
    for slot in db.query(HouseholdMealSchedule).filter(
        HouseholdMealSchedule.household_id == household.id
    ).all():
        keys = _parse_json_list(slot.selected_member_keys)
        if member_key in keys:
            keys.remove(member_key)
            slot.selected_member_keys = json.dumps(keys)

    db.delete(member)
    db.commit()
    return {"message": f"Family member {member_id} deleted successfully"}


_SCHEDULE_TYPES = ("weekday", "weekend_holiday")
_MEAL_TYPES = ("breakfast", "lunch", "dinner")


@router.get("/schedule")
def get_schedule(db: Session = Depends(get_db)):
    """Return the saved meal attendance schedule (weekday / weekend_holiday × breakfast / lunch / dinner)."""
    household = _get_or_create_household(db)
    slots = (
        db.query(HouseholdMealSchedule)
        .filter(HouseholdMealSchedule.household_id == household.id)
        .all()
    )
    result: Dict[str, Dict[str, List[str]]] = {}
    for st in _SCHEDULE_TYPES:
        result[st] = {}
        for mt in _MEAL_TYPES:
            slot = next(
                (s for s in slots if s.schedule_type == st and s.meal_type == mt), None
            )
            result[st][mt] = _parse_json_list(slot.selected_member_keys if slot else "[]")
    return result


@router.put("/schedule")
def update_schedule(payload: ScheduleUpdateRequest, db: Session = Depends(get_db)):
    """Upsert the meal attendance schedule."""
    household = _get_or_create_household(db)
    for st, meals in payload.schedule.items():
        if st not in _SCHEDULE_TYPES:
            continue
        for mt, member_keys in meals.items():
            if mt not in _MEAL_TYPES:
                continue
            existing = (
                db.query(HouseholdMealSchedule)
                .filter(
                    HouseholdMealSchedule.household_id == household.id,
                    HouseholdMealSchedule.schedule_type == st,
                    HouseholdMealSchedule.meal_type == mt,
                )
                .first()
            )
            if existing:
                existing.selected_member_keys = json.dumps(member_keys)
                existing.updated_at = datetime.utcnow().isoformat()
            else:
                db.add(HouseholdMealSchedule(
                    household_id=household.id,
                    schedule_type=st,
                    meal_type=mt,
                    selected_member_keys=json.dumps(member_keys),
                ))
    db.commit()
    return {"message": "Schedule updated successfully"}


@router.post("/meal-plan/today")
def family_meal_plan(payload: FamilyMealPlanRequest, db: Session = Depends(get_db)):
    """
    Generate a household meal plan scaled to combined targets, with per-member
    portion allocations and conflict/allergy notes.
    """
    if not payload.member_keys:
        raise HTTPException(status_code=400, detail="member_keys must not be empty")

    household = _get_or_create_household(db)
    inventory = db.query(InventoryItem).all()

    if not inventory:
        raise HTTPException(
            status_code=404,
            detail="No inventory items found. Add some items first.",
        )

    # ── Resolve members and compute targets ──────────────────────────────────
    resolved: List[Tuple[str, str, Any]] = []  # (key, name, user_like_obj)
    individual_targets: Dict[str, Dict] = {}
    selected_members_info: List[Dict] = []

    for key in payload.member_keys:
        obj, name, resolved_key = _resolve_member(key, db, household)
        resolved.append((resolved_key, name, obj))

        target = calculate_nutrition_target(obj)
        individual_targets[resolved_key] = {
            "member_name": name,
            **{k: target[k] for k in ["calories", "protein_g", "carbs_g", "fat_g"]},
        }

        # Build info dict for notes (parse lists)
        info: Dict = {
            "member_key": resolved_key,
            "name": name,
            "goal": getattr(obj, "goal", "maintenance"),
            "health_conditions": _parse_json_list(getattr(obj, "health_conditions", "[]")),
            "allergies": _parse_json_list(getattr(obj, "allergies", "[]")),
            "strict_avoid_foods": _parse_json_list(getattr(obj, "strict_avoid_foods", "[]")),
        }
        selected_members_info.append(info)

    # ── Combined targets (sum) ────────────────────────────────────────────────
    combined: Dict[str, float] = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for t in individual_targets.values():
        for macro in combined:
            combined[macro] += t[macro]
    combined = {k: round(v, 1) for k, v in combined.items()}
    combined_calories = combined["calories"] or 1.0

    # ── Collect all hard exclusions across all members ────────────────────────
    all_excluded: Set[str] = set()
    for _, _, obj in resolved:
        all_excluded |= get_hard_excluded_foods(obj)

    # ── Build a composite user for meal planning ──────────────────────────────
    composite_user = SimpleNamespace(
        sex="male",
        age=30,
        weight_kg=70.0,
        height_cm=170.0,
        activity_level="moderate",
        goal="maintenance",
        health_conditions="[]",
        allergies=json.dumps(list(all_excluded)),
        strict_avoid_foods="[]",
        macro_strategy="standard",
        custom_calorie_target=None,
        custom_protein_g=None,
        custom_carbs_g=None,
        custom_fat_g=None,
        dietary_preference=None,
        cuisine_preference=None,
        cooking_time_preference=None,
        diet_style=None,
        preferred_foods="[]",
        disliked_foods="[]",
    )

    consumed = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    plan = generate_meal_plan(
        composite_user,
        inventory,
        remaining_macros=combined,
        consumed=consumed,
    )

    # ── Attach per-member allocations to each meal ────────────────────────────
    enriched_meals = []
    for meal in plan.get("meals", []):
        meal_macros = meal.get("estimated_macros", {})
        allocations = []
        for key, name, obj in resolved:
            t = individual_targets[key]
            allocation = _portion_for_member(
                member_key=key,
                member_name=name,
                member_target=t,
                meal_macros=meal_macros,
                combined_calories=combined_calories,
                member_obj=obj,
            )
            allocations.append(allocation)
        enriched_meal = {**meal, "per_member_allocations": allocations}
        enriched_meals.append(enriched_meal)

    # ── Conflict and allergy notes ────────────────────────────────────────────
    conflict_notes = _build_conflict_notes(selected_members_info)
    health_and_allergy_notes = _build_health_allergy_notes(selected_members_info, all_excluded)

    # ── Recommendation summary ────────────────────────────────────────────────
    member_names = [name for _, name, _ in resolved]
    rec_summary = (
        f"Household meal plan for {', '.join(member_names)}. "
        f"Combined daily target: {round(combined['calories'])} kcal, "
        f"{round(combined['protein_g'], 1)}g protein, "
        f"{round(combined['carbs_g'], 1)}g carbs, "
        f"{round(combined['fat_g'], 1)}g fat. "
        + (plan.get("recommendation_summary", ""))
    )

    return {
        "date": str(date.today()),
        "selected_members": selected_members_info,
        "individual_adjusted_targets": individual_targets,
        "combined_household_targets": combined,
        "meals": enriched_meals,
        "conflict_notes": conflict_notes,
        "health_and_allergy_notes": health_and_allergy_notes,
        "recommendation_summary": rec_summary,
    }


@router.post("/grocery-list/weekly")
def family_grocery_list(payload: FamilyGroceryRequest, db: Session = Depends(get_db)):
    """
    Generate a household weekly grocery list combining all selected members'
    nutritional needs, filtered by individual exclusions.
    """
    if not payload.member_keys:
        raise HTTPException(status_code=400, detail="member_keys must not be empty")

    household = _get_or_create_household(db)
    inventory = db.query(InventoryItem).all()
    days_at_home = payload.days_at_home or {}

    # ── Resolve members and compute weekly needs ──────────────────────────────
    resolved: List[Tuple[str, str, Any]] = []
    individual_targets: Dict[str, Dict] = {}
    selected_members_info: List[Dict] = []

    for key in payload.member_keys:
        obj, name, resolved_key = _resolve_member(key, db, household)
        resolved.append((resolved_key, name, obj))

        daily_target = calculate_nutrition_target(obj)
        days = days_at_home.get(resolved_key, days_at_home.get(key, 7))
        weekly: Dict[str, float] = {
            "calories": round(daily_target["calories"] * days, 1),
            "protein_g": round(daily_target["protein_g"] * days, 1),
            "carbs_g": round(daily_target["carbs_g"] * days, 1),
            "fat_g": round(daily_target["fat_g"] * days, 1),
            "days": days,
        }
        individual_targets[resolved_key] = {
            "member_name": name,
            "daily_target": {k: daily_target[k] for k in ["calories", "protein_g", "carbs_g", "fat_g"]},
            "weekly_need": weekly,
        }

        info: Dict = {
            "member_key": resolved_key,
            "name": name,
            "goal": getattr(obj, "goal", "maintenance"),
            "health_conditions": _parse_json_list(getattr(obj, "health_conditions", "[]")),
            "allergies": _parse_json_list(getattr(obj, "allergies", "[]")),
            "strict_avoid_foods": _parse_json_list(getattr(obj, "strict_avoid_foods", "[]")),
            "diet_style": getattr(obj, "diet_style", None),
            "days_at_home": days,
        }
        selected_members_info.append(info)

    # ── Combined weekly targets ────────────────────────────────────────────────
    combined_weekly: Dict[str, float] = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    for t in individual_targets.values():
        for macro in combined_weekly:
            combined_weekly[macro] += t["weekly_need"][macro]
    combined_weekly = {k: round(v, 1) for k, v in combined_weekly.items()}

    # ── Collect all exclusions ────────────────────────────────────────────────
    all_excluded: Set[str] = set()
    for _, _, obj in resolved:
        all_excluded |= get_hard_excluded_foods(obj)

    # ── Inventory analysis ────────────────────────────────────────────────────
    from app.services.expiration_engine import get_expiration_risk

    def _is_low_stock(item: InventoryItem) -> bool:
        if item.unit in ("g", "ml"):
            return item.quantity < 200
        if item.unit in ("kg", "l"):
            return item.quantity < 0.5
        if item.unit in ("lb", "lbs"):
            return item.quantity < 0.5
        if item.unit == "count":
            return item.quantity <= 2
        return item.quantity <= 1

    urgent = [i for i in inventory if get_expiration_risk(i.best_before_date) in ("expired", "high")]
    medium_risk = [i for i in inventory if get_expiration_risk(i.best_before_date) == "medium"]
    low_stock = [
        i for i in inventory
        if _is_low_stock(i)
        and get_expiration_risk(i.best_before_date) not in ("expired", "high")
    ]
    present_names_lower = {i.name.lower() for i in inventory}

    inventory_summary = {
        "total_items": len(inventory),
        "urgent_count": len(urgent),
        "medium_risk_count": len(medium_risk),
        "low_stock_count": len(low_stock),
        "categories_present": sorted({i.category for i in inventory}),
    }

    # ── Use first (expiring / low stock items) ────────────────────────────────
    use_first = [
        {
            "name": i.name,
            "quantity": i.quantity,
            "unit": i.unit,
            "reason": f"{get_expiration_risk(i.best_before_date)} expiration risk — use this week",
        }
        for i in urgent + medium_risk
    ]

    # ── Avoid buying ──────────────────────────────────────────────────────────
    avoid_buying = [
        {
            "name": i.name,
            "reason": (
                f"Already have {i.quantity} {i.unit} with "
                f"{get_expiration_risk(i.best_before_date)} expiration risk — use it first."
            ),
        }
        for i in urgent + medium_risk
    ]

    # ── Staple recommendations (union of all members, filtered by exclusions) ──
    from app.routers.grocery_list import _get_staples  # reuse existing logic

    staple_set: List[Tuple[str, str, str]] = []
    seen_names: Set[str] = set()
    for _, _, obj in resolved:
        for name_s, cat, reason in _get_staples(obj):
            name_lower = name_s.lower()
            if name_lower not in seen_names:
                seen_names.add(name_lower)
                staple_set.append((name_s, cat, reason))

    recommended_to_buy = []

    # 1. Restock low-stock items
    for item in low_stock:
        if not any(ex in item.name.lower() for ex in all_excluded):
            recommended_to_buy.append({
                "name": item.name,
                "category": item.category,
                "reason": f"Running low ({item.quantity} {item.unit} remaining).",
                "priority": "high",
                "estimated_quantity": f"{item.quantity * 3:.0f} {item.unit}",
            })

    # 2. Protein source if needed for combined target
    total_protein_available = sum(
        (i.protein_per_100g or 0) * i.quantity / 100
        for i in inventory
        if i.unit == "g" and (i.protein_per_100g or 0) > 5
    )
    min_weekly_protein = min(
        (t["weekly_need"]["protein_g"] for t in individual_targets.values()),
        default=0,
    )
    if total_protein_available < min_weekly_protein / 2:
        if not any(
            ex in "chicken breast" for ex in all_excluded
        ) and "chicken breast" not in present_names_lower:
            recommended_to_buy.append({
                "name": "Chicken Breast",
                "category": "meat",
                "reason": "Insufficient protein in inventory for combined weekly targets.",
                "priority": "high",
                "estimated_quantity": f"{round(combined_weekly['protein_g'] / 31 * 100)}g",
            })

    # 3. Staples not already stocked and not excluded
    for name_s, cat, reason in staple_set:
        name_lower = name_s.lower()
        if any(name_lower in p or p in name_lower for p in present_names_lower):
            continue  # already stocked
        if any(ex in name_lower for ex in all_excluded):
            continue  # excluded by a household member
        if any(r["name"].lower() == name_lower for r in recommended_to_buy):
            continue  # already added

        # Rough quantity estimate based on combined daily calories
        num_members = len(resolved)
        recommended_to_buy.append({
            "name": name_s,
            "category": cat,
            "reason": reason,
            "priority": "medium",
            "estimated_quantity": f"Enough for {num_members} people × 7 days",
        })

    recommended_to_buy = recommended_to_buy[:15]

    # ── Member-specific notes ─────────────────────────────────────────────────
    member_specific_notes: List[str] = []
    for info in selected_members_info:
        notes_for_member: List[str] = []
        conds = info.get("health_conditions") or []
        allergies = info.get("allergies") or []
        days = info.get("days_at_home", 7)
        goal = info.get("goal", "maintenance")
        name = info["name"]

        if "diabetes" in conds or "prediabetes" in conds:
            notes_for_member.append(
                f"{name} (diabetes/prediabetes): choose low-GI carbs "
                "(oats, legumes, non-starchy veg); avoid white rice and sugary items."
            )
        if "fatty_liver" in conds:
            notes_for_member.append(
                f"{name} (fatty liver): limit saturated fat; prefer steamed/baked cooking."
            )
        if "high_cholesterol" in conds:
            notes_for_member.append(
                f"{name} (high cholesterol): avoid fried and processed foods; choose lean proteins."
            )
        if allergies:
            notes_for_member.append(
                f"{name} has allergies ({', '.join(allergies)}): "
                "do NOT buy or serve these foods."
            )
        if goal == "muscle_gain":
            notes_for_member.append(
                f"{name} (muscle gain): prioritise high-protein items "
                "(chicken, eggs, Greek yogurt, legumes)."
            )
        elif goal == "fat_loss":
            notes_for_member.append(
                f"{name} (fat loss): prefer lean proteins and non-starchy vegetables; "
                "limit refined carbs."
            )
        if days < 7:
            notes_for_member.append(
                f"{name} will be home {days} day(s) this week — quantities are adjusted accordingly."
            )
        member_specific_notes.extend(notes_for_member)

    # ── Conflict notes ────────────────────────────────────────────────────────
    conflict_notes = _build_conflict_notes(selected_members_info)

    # ── Household nutrition summary ───────────────────────────────────────────
    household_nutrition_summary = {
        "combined_weekly_targets": combined_weekly,
        "individual_weekly_needs": {
            key: {
                "name": t["member_name"],
                "days_at_home": t["weekly_need"]["days"],
                "weekly_calories": t["weekly_need"]["calories"],
                "weekly_protein_g": t["weekly_need"]["protein_g"],
                "weekly_carbs_g": t["weekly_need"]["carbs_g"],
                "weekly_fat_g": t["weekly_need"]["fat_g"],
            }
            for key, t in individual_targets.items()
        },
        "all_excluded_foods": sorted(all_excluded),
    }

    return {
        "recommended_to_buy": recommended_to_buy,
        "avoid_buying": avoid_buying,
        "use_first": use_first,
        "household_nutrition_summary": household_nutrition_summary,
        "member_specific_notes": member_specific_notes,
        "conflict_notes": conflict_notes,
        "inventory_summary": inventory_summary,
    }
