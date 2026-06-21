from typing import List, Optional
from pydantic import BaseModel


class StorageLocationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    storage_type: Optional[str] = "other"
    temperature_zone: Optional[str] = "other"
    parent_id: Optional[int] = None


class StorageLocationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    storage_type: Optional[str] = None
    temperature_zone: Optional[str] = None
    parent_id: Optional[int] = None


class StorageLocationResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    storage_type: str = "other"
    temperature_zone: str = "other"
    parent_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    path: str = ""
    children: list = []

    model_config = {"from_attributes": True}
