import datetime
from sqlalchemy import Column, Integer, String, Float, Date
from app.database import Base


class InventoryItem(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    zone = Column(String, nullable=False)      # fridge / freezer / pantry
    category = Column(String, nullable=False)  # meat / vegetable / fruit / dairy / grain / snack / condiment / other
    added_date = Column(Date, default=datetime.date.today)
    best_before_date = Column(Date, nullable=True)
    calories_per_100g = Column(Float, nullable=True)
    protein_per_100g = Column(Float, nullable=True)
    carbs_per_100g = Column(Float, nullable=True)
    fat_per_100g = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    location_id = Column(Integer, nullable=True)  # FK to storage_locations.id (no hard FK)
