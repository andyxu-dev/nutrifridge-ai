import json
from typing import Any, List, Optional
from pydantic import BaseModel, field_validator


def _parse_json_list(v: Any) -> List[str]:
    """Deserialize a JSON string to a list, or pass through if already a list."""
    if v is None:
        return []
    if isinstance(v, list):
        return [str(item) for item in v]
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            return [str(item) for item in parsed] if isinstance(parsed, list) else []
        except (json.JSONDecodeError, ValueError):
            return []
    return []


class FamilyMemberCreate(BaseModel):
    name: str
    relationship_label: Optional[str] = None

    # Body metrics
    age: Optional[int] = None
    sex: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None

    # Goals & preferences
    activity_level: Optional[str] = None
    goal: Optional[str] = None
    dietary_preference: Optional[str] = None
    cuisine_preference: Optional[str] = None
    cooking_time_preference: Optional[str] = None
    diet_style: Optional[str] = None
    preferred_foods: Optional[Any] = None   # accepts list or JSON string
    disliked_foods: Optional[Any] = None    # accepts list or JSON string

    # Health constraints
    health_conditions: Optional[Any] = None    # accepts list or JSON string
    allergies: Optional[Any] = None            # accepts list or JSON string
    strict_avoid_foods: Optional[Any] = None   # accepts list or JSON string
    macro_strategy: Optional[str] = None
    custom_calorie_target: Optional[float] = None
    custom_protein_g: Optional[float] = None
    custom_carbs_g: Optional[float] = None
    custom_fat_g: Optional[float] = None
    is_active: Optional[bool] = True


class FamilyMemberUpdate(BaseModel):
    name: Optional[str] = None
    relationship_label: Optional[str] = None

    age: Optional[int] = None
    sex: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None

    activity_level: Optional[str] = None
    goal: Optional[str] = None
    dietary_preference: Optional[str] = None
    cuisine_preference: Optional[str] = None
    cooking_time_preference: Optional[str] = None
    diet_style: Optional[str] = None
    preferred_foods: Optional[Any] = None
    disliked_foods: Optional[Any] = None

    health_conditions: Optional[Any] = None
    allergies: Optional[Any] = None
    strict_avoid_foods: Optional[Any] = None
    macro_strategy: Optional[str] = None
    custom_calorie_target: Optional[float] = None
    custom_protein_g: Optional[float] = None
    custom_carbs_g: Optional[float] = None
    custom_fat_g: Optional[float] = None
    is_active: Optional[bool] = None


class FamilyMemberResponse(BaseModel):
    id: int
    household_id: int
    name: str
    relationship_label: Optional[str] = None

    age: Optional[int] = None
    sex: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None

    activity_level: Optional[str] = None
    goal: Optional[str] = None
    dietary_preference: Optional[str] = None
    cuisine_preference: Optional[str] = None
    cooking_time_preference: Optional[str] = None
    diet_style: Optional[str] = None
    preferred_foods: List[str] = []
    disliked_foods: List[str] = []

    health_conditions: List[str] = []
    allergies: List[str] = []
    strict_avoid_foods: List[str] = []
    macro_strategy: Optional[str] = None
    custom_calorie_target: Optional[float] = None
    custom_protein_g: Optional[float] = None
    custom_carbs_g: Optional[float] = None
    custom_fat_g: Optional[float] = None

    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("health_conditions", "allergies", "strict_avoid_foods",
                     "preferred_foods", "disliked_foods", mode="before")
    @classmethod
    def parse_json_list_fields(cls, v: Any) -> List[str]:
        return _parse_json_list(v)


class HouseholdResponse(BaseModel):
    id: int
    name: str
    owner_user_id: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    members: List[FamilyMemberResponse] = []

    model_config = {"from_attributes": True}
