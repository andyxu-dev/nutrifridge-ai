from sqlalchemy import Column, Integer, String, Float, Text
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    height_cm = Column(Float, nullable=False)
    weight_kg = Column(Float, nullable=False)
    age = Column(Integer, nullable=False)
    sex = Column(String, nullable=False)            # male / female / other
    activity_level = Column(String, nullable=False) # sedentary / light / moderate / active / very_active
    goal = Column(String, nullable=False)           # fat_loss / muscle_gain / maintenance
    dietary_preference = Column(String, nullable=True)

    # Week 3 — preference fields
    cuisine_preference = Column(String, nullable=True)        # chinese / western / mixed / no_preference
    cooking_time_preference = Column(String, nullable=True)   # quick_15_min / normal_30_min / flexible
    diet_style = Column(String, nullable=True)                # high_protein / balanced / low_carb / low_fat / no_preference
    disliked_foods = Column(Text, nullable=True)              # JSON list
    preferred_foods = Column(Text, nullable=True)             # JSON list

    # Week 4 — health constraint fields
    health_conditions = Column(Text, nullable=True)     # JSON list of condition strings
    allergies = Column(Text, nullable=True)             # JSON list of food allergens
    strict_avoid_foods = Column(Text, nullable=True)    # JSON list of hard-excluded foods
    macro_strategy = Column(String, nullable=True)      # standard / high_protein / moderate_carb / low_carb / low_fat / conservative_surplus / custom
    custom_calorie_target = Column(Float, nullable=True)
    custom_protein_g = Column(Float, nullable=True)
    custom_carbs_g = Column(Float, nullable=True)
    custom_fat_g = Column(Float, nullable=True)
