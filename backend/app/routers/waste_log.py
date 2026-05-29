"""
POST /inventory/{item_id}/discard  — discard an inventory item (fully or partially)
GET  /waste-log                    — list recent waste events
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.inventory import InventoryItem
from app.models.waste_log import WasteLog

router = APIRouter(tags=["waste-log"])


class DiscardRequest(BaseModel):
    reason: str = "expired"          # expired / did_not_want / too_much / other
    quantity: Optional[float] = None  # None means discard the full remaining quantity


def _estimate_calories(item: InventoryItem, qty_discarded: float) -> Optional[float]:
    """Rough calorie estimate based on per-100g values and assumed gram quantity."""
    if item.calories_per_100g is None:
        return None
    # Convert quantity to grams if unit is known
    unit = (item.unit or "").lower()
    grams: Optional[float] = None
    if unit == "g":
        grams = qty_discarded
    elif unit in ("kg",):
        grams = qty_discarded * 1000
    elif unit in ("lb", "lbs"):
        grams = qty_discarded * 453.592
    elif unit == "oz":
        grams = qty_discarded * 28.3495
    else:
        # For count/bag/cup assume a rough 150g equivalent
        grams = qty_discarded * 150

    return round(item.calories_per_100g * grams / 100, 1)


@router.post("/inventory/{item_id}/discard", status_code=201)
def discard_item(item_id: int, body: DiscardRequest, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    qty_to_discard = body.quantity if body.quantity is not None else item.quantity
    if qty_to_discard <= 0:
        raise HTTPException(status_code=422, detail="Quantity to discard must be positive.")
    if qty_to_discard > item.quantity:
        qty_to_discard = item.quantity  # cap to what's available

    calories_wasted = _estimate_calories(item, qty_to_discard)

    # Record the waste event
    entry = WasteLog(
        item_name=item.name,
        quantity=round(qty_to_discard, 4),
        unit=item.unit,
        item_category=item.category,
        reason=body.reason,
        estimated_calories_wasted=calories_wasted,
    )
    db.add(entry)

    # Reduce or delete inventory
    remaining = round(item.quantity - qty_to_discard, 4)
    if remaining <= 0:
        db.delete(item)
    else:
        item.quantity = remaining

    db.commit()
    db.refresh(entry)

    return {
        "message": f"Discarded {qty_to_discard} {item.unit} of {item.name}.",
        "waste_log_id": entry.id,
        "estimated_calories_wasted": calories_wasted,
        "item_deleted": remaining <= 0,
    }


@router.get("/waste-log")
def get_waste_log(limit: int = 30, db: Session = Depends(get_db)):
    entries = (
        db.query(WasteLog)
        .order_by(WasteLog.discarded_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "item_name": e.item_name,
            "quantity": e.quantity,
            "unit": e.unit,
            "item_category": e.item_category,
            "reason": e.reason,
            "estimated_calories_wasted": e.estimated_calories_wasted,
            "discarded_at": str(e.discarded_at),
        }
        for e in entries
    ]
