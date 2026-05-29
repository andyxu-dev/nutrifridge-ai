from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.nutrition_engine import calculate_nutrition_target

router = APIRouter(prefix="/nutrition-target", tags=["nutrition"])


@router.get("")
def get_nutrition_target(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found. Create a profile first.")
    return calculate_nutrition_target(user)
