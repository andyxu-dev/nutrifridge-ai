import datetime
from sqlalchemy import Column, Integer, String, ForeignKey
from app.database import Base


class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    storage_type = Column(String, nullable=False, default="other")  # fridge/freezer/pantry/cabinet/shelf/room/other
    temperature_zone = Column(String, nullable=False, default="other")  # fridge/freezer/pantry/room/other
    parent_id = Column(Integer, ForeignKey("storage_locations.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
