from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine, Base

# Import all models so SQLAlchemy registers them before create_all
import app.models.user          # noqa: F401
import app.models.inventory     # noqa: F401
import app.models.nutrition_log # noqa: F401
import app.models.waste_log     # noqa: F401

from app.routers import profile, inventory, nutrition, meal_plan, nutrition_log, foods
from app.routers import grocery_list, waste_log

Base.metadata.create_all(bind=engine)


def _migrate_db() -> None:
    """Add new columns to existing tables (SQLite has no IF NOT EXISTS on ALTER TABLE)."""
    migrations = [
        # Week 4 — health constraints on users table
        "ALTER TABLE users ADD COLUMN health_conditions TEXT",
        "ALTER TABLE users ADD COLUMN allergies TEXT",
        "ALTER TABLE users ADD COLUMN strict_avoid_foods TEXT",
        "ALTER TABLE users ADD COLUMN macro_strategy VARCHAR",
        "ALTER TABLE users ADD COLUMN custom_calorie_target FLOAT",
        "ALTER TABLE users ADD COLUMN custom_protein_g FLOAT",
        "ALTER TABLE users ADD COLUMN custom_carbs_g FLOAT",
        "ALTER TABLE users ADD COLUMN custom_fat_g FLOAT",
        # Week 4 — source + notes on meal_logs table
        "ALTER TABLE meal_logs ADD COLUMN source VARCHAR",
        "ALTER TABLE meal_logs ADD COLUMN notes TEXT",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists


_migrate_db()

app = FastAPI(
    title="NutriFridge AI API",
    description="Personalized nutrition + refrigerator inventory assistant",
    version="4.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router)
app.include_router(inventory.router)
app.include_router(nutrition.router)
app.include_router(meal_plan.router)
app.include_router(nutrition_log.router)
app.include_router(foods.router)
app.include_router(grocery_list.router)
app.include_router(waste_log.router)


@app.get("/")
def root():
    return {"message": "NutriFridge AI API is running", "docs": "/docs", "version": "4.0.0"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "NutriFridge AI backend"}
