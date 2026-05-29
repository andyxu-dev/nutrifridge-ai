"""
Seed script — populates the database with a sample user profile and inventory items.
Run: python seed.py  (from inside the backend/ directory with venv active)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date, timedelta
from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.inventory import InventoryItem

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Clear existing data
db.query(InventoryItem).delete()
db.query(User).delete()
db.commit()

today = date.today()

# ── User ─────────────────────────────────────────────────────────────────────
import json as _json

user = User(
    name="Alex",
    height_cm=175,
    weight_kg=88,
    age=24,
    sex="male",
    activity_level="moderate",
    goal="fat_loss",
    dietary_preference=None,
    cuisine_preference="mixed",
    cooking_time_preference="normal_30_min",
    diet_style="high_protein",
    disliked_foods=_json.dumps(["mushroom"]),
    preferred_foods=_json.dumps(["chicken breast", "eggs", "beef"]),
)
db.add(user)

# ── Inventory ────────────────────────────────────────────────────────────────
items = [
    InventoryItem(
        name="Beef",
        quantity=2,
        unit="lb",
        zone="fridge",
        category="meat",
        added_date=today,
        best_before_date=today + timedelta(days=2),
        calories_per_100g=250,
        protein_per_100g=26.0,
        carbs_per_100g=0.0,
        fat_per_100g=17.0,
        notes="Ground beef",
    ),
    InventoryItem(
        name="Garlic",
        quantity=1,
        unit="lb",
        zone="pantry",
        category="condiment",
        added_date=today,
        best_before_date=today + timedelta(days=30),
        calories_per_100g=149,
        protein_per_100g=6.4,
        carbs_per_100g=33.0,
        fat_per_100g=0.5,
        notes=None,
    ),
    InventoryItem(
        name="Strawberries",
        quantity=1,
        unit="lb",
        zone="fridge",
        category="fruit",
        added_date=today,
        best_before_date=today + timedelta(days=1),
        calories_per_100g=32,
        protein_per_100g=0.7,
        carbs_per_100g=7.7,
        fat_per_100g=0.3,
        notes=None,
    ),
    InventoryItem(
        name="Eggs",
        quantity=12,
        unit="count",
        zone="fridge",
        category="other",
        added_date=today,
        best_before_date=today + timedelta(days=14),
        calories_per_100g=155,
        protein_per_100g=13.0,
        carbs_per_100g=1.1,
        fat_per_100g=11.0,
        notes="Large eggs",
    ),
    InventoryItem(
        name="Spinach",
        quantity=1,
        unit="bag",
        zone="fridge",
        category="vegetable",
        added_date=today,
        best_before_date=today + timedelta(days=3),
        calories_per_100g=23,
        protein_per_100g=2.9,
        carbs_per_100g=3.6,
        fat_per_100g=0.4,
        notes=None,
    ),
    InventoryItem(
        name="Greek Yogurt",
        quantity=4,
        unit="cups",
        zone="fridge",
        category="dairy",
        added_date=today,
        best_before_date=today + timedelta(days=7),
        calories_per_100g=59,
        protein_per_100g=10.0,
        carbs_per_100g=3.6,
        fat_per_100g=0.4,
        notes="Plain, non-fat",
    ),
    InventoryItem(
        name="Cooked Rice",
        quantity=500,
        unit="g",
        zone="fridge",
        category="grain",
        added_date=today,
        best_before_date=today + timedelta(days=2),
        calories_per_100g=130,
        protein_per_100g=2.7,
        carbs_per_100g=28.0,
        fat_per_100g=0.3,
        notes=None,
    ),
]

for item in items:
    db.add(item)

db.commit()
db.close()

print("✓ Seed data inserted successfully!")
print(f"  User  : Alex — 175 cm, 88 kg, 24 yo, male, moderate activity, fat_loss goal")
print(f"  Items : {len(items)} inventory items added")
