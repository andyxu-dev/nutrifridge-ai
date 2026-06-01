from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.nutrition_engine import calculate_nutrition_target
from app.services.health_constraint_engine import get_health_mode_summary

router = APIRouter(prefix="/nutrition-target", tags=["nutrition"])

_DISCLAIMER = (
    "NutriFridge AI provides nutrition estimates for planning purposes only "
    "and is not medical advice. Users with health conditions should consult "
    "a qualified healthcare professional."
)


@router.get("")
def get_nutrition_target(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(
            status_code=404, detail="No profile found. Create a profile first."
        )
    target = calculate_nutrition_target(user)
    target["health_mode_summary"] = get_health_mode_summary(user)
    target["disclaimer"] = _DISCLAIMER
    return target
