import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.inventory import InventoryItem
from app.models.nutrition_log import DailyLog, MealLog
from app.schemas.nutrition_log import MealLogCreate
from app.services.nutrition_engine import calculate_nutrition_target
from app.services.unit_converter import deduct_quantity

router = APIRouter(prefix="/nutrition-log", tags=["nutrition-log"])


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
        db.flush()  # get the id without committing
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
        "created_at": str(meal.created_at) if meal.created_at else None,
    }


def _build_log_response(user: User, daily_log: DailyLog | None, db: Session, warnings: list | None = None) -> dict:
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
        "protein_pct": _pct(consumed["protein_g"], target["protein_g"]),
        "carbs_pct": _pct(consumed["carbs_g"], target["carbs_g"]),
        "fat_pct": _pct(consumed["fat_g"], target["fat_g"]),
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

    # Create meal log entry
    meal_log = MealLog(
        daily_log_id=daily_log.id,
        meal_type=meal_data.meal_type,
        meal_name=meal_data.meal_name,
        calories=meal_data.calories,
        protein_g=meal_data.protein_g,
        carbs_g=meal_data.carbs_g,
        fat_g=meal_data.fat_g,
        ingredients_used=json.dumps([ing.model_dump() for ing in meal_data.ingredients_used]),
    )
    db.add(meal_log)

    # Update daily totals
    daily_log.calories_consumed = round(daily_log.calories_consumed + meal_data.calories, 1)
    daily_log.protein_consumed_g = round(daily_log.protein_consumed_g + meal_data.protein_g, 1)
    daily_log.carbs_consumed_g = round(daily_log.carbs_consumed_g + meal_data.carbs_g, 1)
    daily_log.fat_consumed_g = round(daily_log.fat_consumed_g + meal_data.fat_g, 1)

    # Deduct from inventory
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
        daily_log.calories_consumed = max(0.0, round(daily_log.calories_consumed - meal_log.calories, 1))
        daily_log.protein_consumed_g = max(0.0, round(daily_log.protein_consumed_g - meal_log.protein_g, 1))
        daily_log.carbs_consumed_g = max(0.0, round(daily_log.carbs_consumed_g - meal_log.carbs_g, 1))
        daily_log.fat_consumed_g = max(0.0, round(daily_log.fat_consumed_g - meal_log.fat_g, 1))

    db.delete(meal_log)
    db.commit()

    if daily_log:
        db.refresh(daily_log)

    return _build_log_response(user, daily_log, db, warnings=["Inventory quantities were not restored on deletion."])
