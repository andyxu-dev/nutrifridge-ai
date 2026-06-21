from typing import Optional
from datetime import date
from enum import Enum
from pydantic import BaseModel


class ZoneEnum(str, Enum):
    fridge = "fridge"
    freezer = "freezer"
    pantry = "pantry"


class CategoryEnum(str, Enum):
    meat = "meat"
    vegetable = "vegetable"
    fruit = "fruit"
    dairy = "dairy"
    grain = "grain"
    snack = "snack"
    condiment = "condiment"
    other = "other"


class InventoryBase(BaseModel):
    name: str
    quantity: float
    unit: str
    zone: ZoneEnum
    category: CategoryEnum
    added_date: Optional[date] = None
    best_before_date: Optional[date] = None
    calories_per_100g: Optional[float] = None
    protein_per_100g: Optional[float] = None
    carbs_per_100g: Optional[float] = None
    fat_per_100g: Optional[float] = None
    notes: Optional[str] = None
    location_id: Optional[int] = None


class InventoryCreate(InventoryBase):
    pass


class InventoryUpdate(InventoryBase):
    pass


class InventoryResponse(InventoryBase):
    id: int
    expiration_risk: Optional[str] = None
    location_path: Optional[str] = None
    location_name: Optional[str] = None

    model_config = {"from_attributes": True}
