from typing import Literal, Optional, List, Any
from pydantic import BaseModel, Field


class IngredientUsed(BaseModel):
    inventory_item_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=120)
    quantity_used: float = Field(..., gt=0)
    unit: str = Field(..., min_length=1, max_length=24)


class MealLogCreate(BaseModel):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    meal_name: str = Field(..., min_length=1, max_length=160)
    calories: float = Field(..., ge=0)
    protein_g: float = Field(..., ge=0)
    carbs_g: float = Field(..., ge=0)
    fat_g: float = Field(..., ge=0)
    ingredients_used: List[IngredientUsed] = Field(default_factory=list)


class ManualMealCreate(BaseModel):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    meal_name: str = Field(..., min_length=1, max_length=160)
    calories: float = Field(..., ge=0)
    protein_g: float = Field(..., ge=0)
    carbs_g: float = Field(..., ge=0)
    fat_g: float = Field(..., ge=0)
    notes: Optional[str] = Field(default=None, max_length=500)


class MealLogResponse(BaseModel):
    id: int
    meal_type: str
    meal_name: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    ingredients_used: List[Any] = []
    source: Optional[str] = "recommended"
    notes: Optional[str] = None
    created_at: Optional[str] = None


class NutritionLogResponse(BaseModel):
    date: str
    target: dict
    consumed: dict
    remaining: dict
    progress: dict
    meals: List[MealLogResponse] = []
    warnings: List[str] = []
