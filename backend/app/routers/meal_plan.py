from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.inventory import InventoryItem
from app.models.nutrition_log import DailyLog
from app.services.meal_planner import generate_meal_plan
from app.services.nutrition_engine import calculate_nutrition_target

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])


@router.get("/today")
def get_today_meal_plan(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found. Create a profile first.")

    inventory = db.query(InventoryItem).all()
    if not inventory:
        raise HTTPException(status_code=404, detail="No inventory items found. Add some items first.")

    # Pull today's consumed macros so the planner knows what's already been eaten
    target = calculate_nutrition_target(user)
    daily_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()

    if daily_log:
        consumed = {
            "calories":  round(daily_log.calories_consumed, 1),
            "protein_g": round(daily_log.protein_consumed_g, 1),
            "carbs_g":   round(daily_log.carbs_consumed_g, 1),
            "fat_g":     round(daily_log.fat_consumed_g, 1),
        }
        remaining = {
            key: max(0.0, round(target[key] - consumed[key], 1))
            for key in ["calories", "protein_g", "carbs_g", "fat_g"]
        }
    else:
        consumed = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
        remaining = {k: target[k] for k in ["calories", "protein_g", "carbs_g", "fat_g"]}

    return generate_meal_plan(user, inventory, remaining_macros=remaining, consumed=consumed)
