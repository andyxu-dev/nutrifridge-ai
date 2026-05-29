from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.inventory import InventoryItem
from app.schemas.inventory import InventoryCreate, InventoryUpdate
from app.services.expiration_engine import get_expiration_risk, sort_by_risk
from app.services.food_database import find_best_match

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _enrich(item: InventoryItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "quantity": item.quantity,
        "unit": item.unit,
        "zone": item.zone,
        "category": item.category,
        "added_date": item.added_date,
        "best_before_date": item.best_before_date,
        "calories_per_100g": item.calories_per_100g,
        "protein_per_100g": item.protein_per_100g,
        "carbs_per_100g": item.carbs_per_100g,
        "fat_per_100g": item.fat_per_100g,
        "notes": item.notes,
        "expiration_risk": get_expiration_risk(item.best_before_date),
    }


def _autofill_nutrition(item_data: dict) -> dict:
    """If nutrition values are all missing/zero, try to fill from the local food database."""
    has_nutrition = any(
        item_data.get(f) not in (None, 0, 0.0)
        for f in ["calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"]
    )
    if has_nutrition:
        return item_data  # user provided values — respect them

    match = find_best_match(item_data["name"])
    if match:
        item_data.setdefault("calories_per_100g", match["calories_per_100g"])
        item_data.setdefault("protein_per_100g",  match["protein_per_100g"])
        item_data.setdefault("carbs_per_100g",    match["carbs_per_100g"])
        item_data.setdefault("fat_per_100g",      match["fat_per_100g"])
        # Auto-fill category only if the user left it as the default "other"
        if item_data.get("category") == "other" and match.get("category"):
            item_data["category"] = match["category"]

    return item_data


@router.post("", status_code=201)
def create_item(item: InventoryCreate, db: Session = Depends(get_db)):
    item_data = item.model_dump()
    if item_data.get("added_date") is None:
        item_data["added_date"] = date.today()

    item_data = _autofill_nutrition(item_data)

    db_item = InventoryItem(**item_data)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return _enrich(db_item)


# /urgent must be declared before /{item_id} so FastAPI doesn't treat "urgent" as an ID
@router.get("/urgent")
def get_urgent_items(db: Session = Depends(get_db)):
    items = db.query(InventoryItem).all()
    sorted_items = sort_by_risk(items)
    return [
        _enrich(item)
        for item in sorted_items
        if get_expiration_risk(item.best_before_date) in ("expired", "high", "medium")
    ]


@router.get("")
def get_all_items(db: Session = Depends(get_db)):
    items = db.query(InventoryItem).all()
    return [_enrich(item) for item in sort_by_risk(items)]


@router.get("/{item_id}")
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _enrich(item)


@router.put("/{item_id}")
def update_item(item_id: int, item_update: InventoryUpdate, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in item_update.model_dump().items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return _enrich(item)


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": f"Item {item_id} deleted successfully"}
