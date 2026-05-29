import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime
from app.database import Base


class WasteLog(Base):
    __tablename__ = "waste_logs"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    item_category = Column(String, nullable=True)
    reason = Column(String, nullable=False)   # expired / did_not_want / too_much / other
    estimated_calories_wasted = Column(Float, nullable=True)
    discarded_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
