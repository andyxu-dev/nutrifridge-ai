import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.inventory import InventoryItem
from app.models.nutrition_log import DailyLog, MealLog
from app.schemas.nutrition_log import MealLogCreate, ManualMealCreate
from app.services.nutrition_engine import calculate_nutrition_target
from app.services.unit_converter import deduct_quantity
from app.services.health_constraint_engine import _parse_list

router = APIRouter(prefix="/nutrition-log", tags=["nutrition-log"])

_DISCLAIMER = (
    "NutriFridge AI provides nutrition estimates for planning purposes only "
    "and is not medical advice."
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_daily_log(user: User, db: Session) -> DailyLog:
    today = date.today()
    daily_log = db.query(DailyLog).filter(DailyLog.date == today).first()
    if not daily_log:
        daily_log = DailyLog(
            user_id=user.id,
            date=today,
            calories_consumed=0.0,
            protein_consumed_g=0.0,
            carbs_consumed_g=0.0,
            fat_consumed_g=0.0,
        )
        db.add(daily_log)
        db.flush()
    return daily_log


def _format_meal(meal: MealLog) -> dict:
    ingredients: list = []
    if meal.ingredients_used:
        try:
            ingredients = json.loads(meal.ingredients_used)
        except (ValueError, TypeError):
            pass
    return {
        "id": meal.id,
        "meal_type": meal.meal_type,
        "meal_name": meal.meal_name,
        "calories": meal.calories,
        "protein_g": meal.protein_g,
        "carbs_g": meal.carbs_g,
        "fat_g": meal.fat_g,
        "ingredients_used": ingredients,
        "source": getattr(meal, "source", "recommended") or "recommended",
        "notes": getattr(meal, "notes", None),
        "created_at": str(meal.created_at) if meal.created_at else None,
    }


def _build_log_response(
    user: User, daily_log: DailyLog | None, db: Session, warnings: list | None = None
) -> dict:
    target = calculate_nutrition_target(user)

    if daily_log is None:
        consumed = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
        meals_out: list = []
    else:
        consumed = {
            "calories": round(daily_log.calories_consumed, 1),
            "protein_g": round(daily_log.protein_consumed_g, 1),
            "carbs_g": round(daily_log.carbs_consumed_g, 1),
            "fat_g": round(daily_log.fat_consumed_g, 1),
        }
        meal_rows = (
            db.query(MealLog)
            .filter(MealLog.daily_log_id == daily_log.id)
            .order_by(MealLog.created_at)
            .all()
        )
        meals_out = [_format_meal(m) for m in meal_rows]

    remaining = {
        key: round(target[key] - consumed[key], 1)
        for key in ["calories", "protein_g", "carbs_g", "fat_g"]
    }

    def _pct(consumed_val: float, target_val: float) -> float:
        if target_val <= 0:
            return 0.0
        return round(min(100.0, consumed_val / target_val * 100), 1)

    progress = {
        "calories_pct": _pct(consumed["calories"], target["calories"]),
        "protein_pct":  _pct(consumed["protein_g"], target["protein_g"]),
        "carbs_pct":    _pct(consumed["carbs_g"], target["carbs_g"]),
        "fat_pct":      _pct(consumed["fat_g"], target["fat_g"]),
    }

    return {
        "date": str(date.today()),
        "target": target,
        "consumed": consumed,
        "remaining": remaining,
        "progress": progress,
        "meals": meals_out,
        "warnings": warnings or [],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/today")
def get_today_log(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found. Create a profile first.")
    daily_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    return _build_log_response(user, daily_log, db)


@router.post("/meal")
def log_meal(meal_data: MealLogCreate, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found.")

    daily_log = _get_or_create_daily_log(user, db)

    meal_log = MealLog(
        daily_log_id=daily_log.id,
        meal_type=meal_data.meal_type,
        meal_name=meal_data.meal_name,
        calories=meal_data.calories,
        protein_g=meal_data.protein_g,
        carbs_g=meal_data.carbs_g,
        fat_g=meal_data.fat_g,
        ingredients_used=json.dumps([ing.model_dump() for ing in meal_data.ingredients_used]),
        source="recommended",
    )
    db.add(meal_log)

    daily_log.calories_consumed   = round(daily_log.calories_consumed   + meal_data.calories,   1)
    daily_log.protein_consumed_g  = round(daily_log.protein_consumed_g  + meal_data.protein_g,  1)
    daily_log.carbs_consumed_g    = round(daily_log.carbs_consumed_g    + meal_data.carbs_g,    1)
    daily_log.fat_consumed_g      = round(daily_log.fat_consumed_g      + meal_data.fat_g,      1)

    warnings: list[str] = []
    for ing in meal_data.ingredients_used:
        if not ing.inventory_item_id:
            continue
        item = db.query(InventoryItem).filter(InventoryItem.id == ing.inventory_item_id).first()
        if not item:
            warnings.append(f"Inventory item {ing.inventory_item_id} not found — skipped deduction.")
            continue
        new_qty, warning = deduct_quantity(item.quantity, item.unit, ing.quantity_used, ing.unit)
        item.quantity = new_qty
        if warning:
            warnings.append(warning)

    db.commit()
    db.refresh(daily_log)
    return _build_log_response(user, daily_log, db, warnings=warnings)


@router.post("/manual-meal")
def log_manual_meal(meal_data: ManualMealCreate, db: Session = Depends(get_db)):
    """
    Log a manually entered meal without touching the inventory.
    Useful for food eaten outside the home or custom items.
    """
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found.")

    daily_log = _get_or_create_daily_log(user, db)

    meal_log = MealLog(
        daily_log_id=daily_log.id,
        meal_type=meal_data.meal_type,
        meal_name=meal_data.meal_name,
        calories=meal_data.calories,
        protein_g=meal_data.protein_g,
        carbs_g=meal_data.carbs_g,
        fat_g=meal_data.fat_g,
        ingredients_used=json.dumps([]),
        source="manual",
        notes=meal_data.notes,
    )
    db.add(meal_log)

    daily_log.calories_consumed   = round(daily_log.calories_consumed   + meal_data.calories,   1)
    daily_log.protein_consumed_g  = round(daily_log.protein_consumed_g  + meal_data.protein_g,  1)
    daily_log.carbs_consumed_g    = round(daily_log.carbs_consumed_g    + meal_data.carbs_g,    1)
    daily_log.fat_consumed_g      = round(daily_log.fat_consumed_g      + meal_data.fat_g,      1)

    db.commit()
    db.refresh(daily_log)
    return _build_log_response(user, daily_log, db)


@router.get("/analysis/today")
def get_nutrition_analysis_today(db: Session = Depends(get_db)):
    """
    Return a plain-English analysis of today's nutrition vs. adjusted targets,
    including macro status, health-specific notes, and a next-meal recommendation.
    """
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found.")

    daily_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    target = calculate_nutrition_target(user)

    consumed = {
        "calories": round(daily_log.calories_consumed if daily_log else 0, 1),
        "protein_g": round(daily_log.protein_consumed_g if daily_log else 0, 1),
        "carbs_g": round(daily_log.carbs_consumed_g if daily_log else 0, 1),
        "fat_g": round(daily_log.fat_consumed_g if daily_log else 0, 1),
    }

    remaining = {
        key: round(target[key] - consumed[key], 1)
        for key in ["calories", "protein_g", "carbs_g", "fat_g"]
    }

    def _status(consumed_val: float, target_val: float) -> str:
        if target_val <= 0:
            return "on_track"
        pct = consumed_val / target_val
        if pct < 0.50:
            return "under"
        elif pct <= 1.10:
            return "on_track"
        return "over"

    macro_status = {
        "calories": _status(consumed["calories"], target["calories"]),
        "protein":  _status(consumed["protein_g"], target["protein_g"]),
        "carbs":    _status(consumed["carbs_g"],   target["carbs_g"]),
        "fat":      _status(consumed["fat_g"],     target["fat_g"]),
    }

    # Health-condition–specific notes
    conditions = _parse_list(getattr(user, "health_conditions", None))
    health_notes: list[str] = []
    if "fatty_liver" in conditions:
        health_notes.append(
            "Choose lean proteins and avoid fried or high-fat foods."
        )
    if "diabetes" in conditions or "prediabetes" in conditions:
        health_notes.append(
            "Spread carbohydrate intake evenly and pair carbs with protein or fibre to slow absorption."
        )
    if "high_cholesterol" in conditions:
        health_notes.append(
            "Prioritise lean protein sources and minimise saturated fats."
        )
    if "hypertension" in conditions:
        health_notes.append("Reduce high-sodium foods and processed snacks.")
    if "gout" in conditions:
        health_notes.append("Avoid high-purine foods such as organ meats and shellfish.")
    if "kidney_disease" in conditions:
        health_notes.append(
            "Follow your dietitian's guidance on protein and fluid intake."
        )

    # Plain-English summary
    issues: list[str] = []
    if macro_status["calories"] == "over":
        issues.append("calorie target exceeded")
    elif macro_status["calories"] == "under":
        issues.append("more calories still available")
    if macro_status["protein"] == "under":
        issues.append("protein is low")
    elif macro_status["protein"] == "over":
        issues.append("protein is above target")
    if macro_status["carbs"] == "over":
        issues.append("carbs are high")
    if macro_status["fat"] == "over":
        issues.append("fat is high")

    if not issues:
        summary = "You are on track with all nutrition targets for today — great work!"
    else:
        summary = "Today's snapshot: " + ", ".join(issues) + "."

    # Next-meal recommendation
    next_rec = _next_meal_recommendation(macro_status, conditions, remaining)

    return {
        "date": str(date.today()),
        "consumed": consumed,
        "target": target,
        "remaining": remaining,
        "macro_status": macro_status,
        "health_notes": health_notes,
        "summary": summary,
        "next_meal_recommendation": next_rec,
        "adjustment_reasons": target.get("adjustment_reasons", []),
        "disclaimer": _DISCLAIMER,
    }


def _next_meal_recommendation(
    macro_status: dict, conditions: list, remaining: dict
) -> str:
    if macro_status.get("calories") == "over":
        return (
            "You have reached your calorie target. "
            "Consider a protein-only snack if still hungry."
        )

    parts: list[str] = []

    if macro_status.get("protein") == "under":
        parts.append("lean high-protein foods (chicken, eggs, fish, legumes)")
    if macro_status.get("fat") == "over":
        parts.append("avoid added oils and high-fat snacks for your next meal")
    if macro_status.get("carbs") == "over":
        parts.append("choose protein and vegetables rather than starchy carbs")

    if "fatty_liver" in conditions:
        parts.append("opt for steamed, grilled, or stir-fried over fried")
    if "diabetes" in conditions or "prediabetes" in conditions:
        parts.append("pair any carbs with protein and fat to manage blood sugar")
    if "high_cholesterol" in conditions:
        parts.append("choose lean protein and avoid saturated fat")

    if not parts:
        return "Continue with your planned meals — you are on track for today."

    return "For your next meal, consider: " + "; ".join(parts) + "."


@router.delete("/meal/{meal_log_id}")
def delete_meal_log(meal_log_id: int, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found.")

    meal_log = db.query(MealLog).filter(MealLog.id == meal_log_id).first()
    if not meal_log:
        raise HTTPException(status_code=404, detail="Meal log not found.")

    daily_log = db.query(DailyLog).filter(DailyLog.id == meal_log.daily_log_id).first()
    if daily_log:
        daily_log.calories_consumed   = max(0.0, round(daily_log.calories_consumed   - meal_log.calories,   1))
        daily_log.protein_consumed_g  = max(0.0, round(daily_log.protein_consumed_g  - meal_log.protein_g,  1))
        daily_log.carbs_consumed_g    = max(0.0, round(daily_log.carbs_consumed_g    - meal_log.carbs_g,    1))
        daily_log.fat_consumed_g      = max(0.0, round(daily_log.fat_consumed_g      - meal_log.fat_g,      1))

    db.delete(meal_log)
    db.commit()

    if daily_log:
        db.refresh(daily_log)

    return _build_log_response(
        user, daily_log, db,
        warnings=["Inventory quantities were not restored on deletion."],
    )
