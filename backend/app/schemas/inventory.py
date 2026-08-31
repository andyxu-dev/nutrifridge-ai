from typing import Optional
from datetime import date
from enum import Enum
from pydantic import BaseModel, Field


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
    name: str = Field(..., min_length=1, max_length=120)
    quantity: float = Field(..., ge=0)
    unit: str = Field(..., min_length=1, max_length=24)
    zone: ZoneEnum
    category: CategoryEnum
    added_date: Optional[date] = None
    best_before_date: Optional[date] = None
    calories_per_100g: Optional[float] = Field(default=None, ge=0)
    protein_per_100g: Optional[float] = Field(default=None, ge=0)
    carbs_per_100g: Optional[float] = Field(default=None, ge=0)
    fat_per_100g: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)
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
