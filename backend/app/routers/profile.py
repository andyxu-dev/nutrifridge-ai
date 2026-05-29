import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse

router = APIRouter(prefix="/profile", tags=["profile"])


def _serialize_user_data(data: dict) -> dict:
    """Convert List fields to JSON strings for DB storage."""
    for field in ("disliked_foods", "preferred_foods"):
        val = data.get(field)
        if isinstance(val, list):
            data[field] = json.dumps(val)
        elif val is None:
            data[field] = json.dumps([])
    return data


@router.post("", response_model=UserResponse, status_code=201)
def create_profile(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).first():
        raise HTTPException(status_code=400, detail="Profile already exists. Use PUT to update.")
    data = _serialize_user_data(user.model_dump())
    db_user = User(**data)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.get("", response_model=UserResponse)
def get_profile(db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found. Create one first.")
    return user


@router.put("", response_model=UserResponse)
def update_profile(user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No profile found. Use POST to create one.")
    data = _serialize_user_data(user_update.model_dump())
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
