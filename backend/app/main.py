from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base

# Import all models so SQLAlchemy registers them before create_all
import app.models.user          # noqa: F401
import app.models.inventory     # noqa: F401
import app.models.nutrition_log # noqa: F401
import app.models.waste_log     # noqa: F401

from app.routers import profile, inventory, nutrition, meal_plan, nutrition_log, foods
from app.routers import grocery_list, waste_log

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NutriFridge AI API",
    description="Personalized nutrition + refrigerator inventory assistant",
    version="3.0.0",
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
    return {"message": "NutriFridge AI API is running", "docs": "/docs", "version": "3.0.0"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "NutriFridge AI backend"}
