import datetime
from sqlalchemy import Column, Integer, Float, String, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False, unique=True)
    calories_consumed = Column(Float, default=0.0, nullable=False)
    protein_consumed_g = Column(Float, default=0.0, nullable=False)
    carbs_consumed_g = Column(Float, default=0.0, nullable=False)
    fat_consumed_g = Column(Float, default=0.0, nullable=False)

    meal_logs = relationship(
        "MealLog", back_populates="daily_log", cascade="all, delete-orphan"
    )


class MealLog(Base):
    __tablename__ = "meal_logs"

    id = Column(Integer, primary_key=True, index=True)
    daily_log_id = Column(Integer, ForeignKey("daily_logs.id"), nullable=False)
    meal_type = Column(String, nullable=False)   # breakfast / lunch / dinner / snack
    meal_name = Column(String, nullable=False)
    calories = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)
    ingredients_used = Column(String, nullable=True)  # JSON text
    created_at = Column(DateTime, default=datetime.datetime.now)

    daily_log = relationship("DailyLog", back_populates="meal_logs")
