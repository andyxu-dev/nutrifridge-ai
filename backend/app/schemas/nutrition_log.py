from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel


class IngredientUsed(BaseModel):
    inventory_item_id: Optional[int] = None
    name: str
    quantity_used: float
    unit: str


class MealLogCreate(BaseModel):
    meal_type: str
    meal_name: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    ingredients_used: List[IngredientUsed] = []


class MealLogResponse(BaseModel):
    id: int
    meal_type: str
    meal_name: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    ingredients_used: List[Any] = []
    created_at: Optional[str] = None


class NutritionLogResponse(BaseModel):
    date: str
    target: dict
    consumed: dict
    remaining: dict
    progress: dict
    meals: List[MealLogResponse] = []
    warnings: List[str] = []
