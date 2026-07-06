import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Household(Base):
    __tablename__ = "households"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, default="My Household")
    owner_user_id = Column(Integer, nullable=False)  # FK to users.id (no hard FK to keep migrations simple)
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat(),
                        onupdate=lambda: datetime.datetime.utcnow().isoformat())

    members = relationship("FamilyMember", back_populates="household", cascade="all, delete-orphan")


class FamilyMember(Base):
    __tablename__ = "family_members"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    relationship_label = Column(String, nullable=True)  # spouse / parent / child / roommate / other

    # Body metrics
    age = Column(Integer, nullable=True)
    sex = Column(String, nullable=True)           # male / female / other
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)

    # Goals & preferences
    activity_level = Column(String, nullable=True)
    goal = Column(String, nullable=True)
    dietary_preference = Column(String, nullable=True)
    cuisine_preference = Column(String, nullable=True)
    cooking_time_preference = Column(String, nullable=True)
    diet_style = Column(String, nullable=True)
    preferred_foods = Column(Text, nullable=True)   # JSON list
    disliked_foods = Column(Text, nullable=True)    # JSON list

    # Health constraints
    health_conditions = Column(Text, nullable=True)    # JSON list
    allergies = Column(Text, nullable=True)            # JSON list
    strict_avoid_foods = Column(Text, nullable=True)   # JSON list
    macro_strategy = Column(String, nullable=True)
    custom_calorie_target = Column(Float, nullable=True)
    custom_protein_g = Column(Float, nullable=True)
    custom_carbs_g = Column(Float, nullable=True)
    custom_fat_g = Column(Float, nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat(),
                        onupdate=lambda: datetime.datetime.utcnow().isoformat())

    household = relationship("Household", back_populates="members")


class HouseholdMealSchedule(Base):
    """Persistent weekday / weekend-holiday attendance template per meal slot."""
    __tablename__ = "household_meal_schedules"

    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    schedule_type = Column(String, nullable=False)           # "weekday" | "weekend_holiday"
    meal_type = Column(String, nullable=False)               # "breakfast" | "lunch" | "dinner"
    selected_member_keys = Column(Text, nullable=True, default="[]")  # JSON list of member keys
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat(),
                        onupdate=lambda: datetime.datetime.utcnow().isoformat())
