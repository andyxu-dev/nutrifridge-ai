import json
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, field_validator


class SexEnum(str, Enum):
    male = "male"
    female = "female"
    other = "other"


class ActivityLevelEnum(str, Enum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class GoalEnum(str, Enum):
    fat_loss = "fat_loss"
    muscle_gain = "muscle_gain"
    maintenance = "maintenance"


class CuisinePreferenceEnum(str, Enum):
    chinese = "chinese"
    western = "western"
    mixed = "mixed"
    no_preference = "no_preference"


class CookingTimePreferenceEnum(str, Enum):
    quick_15_min = "quick_15_min"
    normal_30_min = "normal_30_min"
    flexible = "flexible"


class DietStyleEnum(str, Enum):
    high_protein = "high_protein"
    balanced = "balanced"
    low_carb = "low_carb"
    low_fat = "low_fat"
    no_preference = "no_preference"


class MacroStrategyEnum(str, Enum):
    standard = "standard"
    high_protein = "high_protein"
    moderate_carb = "moderate_carb"
    low_carb = "low_carb"
    low_fat = "low_fat"
    conservative_surplus = "conservative_surplus"
    custom = "custom"


class UserBase(BaseModel):
    name: str
    height_cm: float
    weight_kg: float
    age: int
    sex: SexEnum
    activity_level: ActivityLevelEnum
    goal: GoalEnum
    dietary_preference: Optional[str] = None

    # Week 3 preferences
    cuisine_preference: Optional[CuisinePreferenceEnum] = None
    cooking_time_preference: Optional[CookingTimePreferenceEnum] = None
    diet_style: Optional[DietStyleEnum] = None
    disliked_foods: Optional[List[str]] = None
    preferred_foods: Optional[List[str]] = None

    # Week 4 health constraints
    health_conditions: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    strict_avoid_foods: Optional[List[str]] = None
    macro_strategy: Optional[MacroStrategyEnum] = None
    custom_calorie_target: Optional[float] = None
    custom_protein_g: Optional[float] = None
    custom_carbs_g: Optional[float] = None
    custom_fat_g: Optional[float] = None


class UserCreate(UserBase):
    pass


class UserUpdate(UserBase):
    pass


_JSON_LIST_FIELDS = (
    "disliked_foods",
    "preferred_foods",
    "health_conditions",
    "allergies",
    "strict_avoid_foods",
)


class UserResponse(UserBase):
    id: int

    @field_validator(*_JSON_LIST_FIELDS, mode="before")
    @classmethod
    def parse_json_list(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return []
        return v

    model_config = {"from_attributes": True}
