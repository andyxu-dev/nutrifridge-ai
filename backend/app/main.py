from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import engine, Base, SessionLocal
from app.migrations import migrate_db

# Import all models so SQLAlchemy registers them before create_all
import app.models.user          # noqa: F401
import app.models.inventory     # noqa: F401
import app.models.nutrition_log # noqa: F401
import app.models.waste_log     # noqa: F401
import app.models.household     # noqa: F401
import app.models.location      # noqa: F401
import app.models.assistant     # noqa: F401

from app.routers import profile, inventory, nutrition, meal_plan, nutrition_log, foods
from app.routers import grocery_list, waste_log, family, locations, assistant

Base.metadata.create_all(bind=engine)


def _seed_defaults(db: Session) -> None:
    """
    Create default storage locations and a default household if they don't exist.
    Also assign existing inventory items to matching default locations based on zone.
    """
    from app.models.location import StorageLocation
    from app.models.household import Household
    from app.models.inventory import InventoryItem
    from app.models.user import User

    # ── Default storage locations ─────────────────────────────────────────────
    existing_locs = db.query(StorageLocation).first()
    fridge_loc = freezer_loc = pantry_loc = None

    if not existing_locs:
        fridge_loc = StorageLocation(
            name="Default Fridge",
            description="Main refrigerator",
            storage_type="fridge",
            temperature_zone="fridge",
        )
        freezer_loc = StorageLocation(
            name="Default Freezer",
            description="Main freezer",
            storage_type="freezer",
            temperature_zone="freezer",
        )
        pantry_loc = StorageLocation(
            name="Default Pantry",
            description="Pantry / dry storage",
            storage_type="pantry",
            temperature_zone="pantry",
        )
        db.add_all([fridge_loc, freezer_loc, pantry_loc])
        db.flush()  # populate IDs without committing yet
    else:
        # Look up existing defaults by name to use for assignment below
        fridge_loc = db.query(StorageLocation).filter(
            StorageLocation.name == "Default Fridge"
        ).first()
        freezer_loc = db.query(StorageLocation).filter(
            StorageLocation.name == "Default Freezer"
        ).first()
        pantry_loc = db.query(StorageLocation).filter(
            StorageLocation.name == "Default Pantry"
        ).first()

    # ── Default household ─────────────────────────────────────────────────────
    existing_household = db.query(Household).first()
    if not existing_household:
        user = db.query(User).first()
        owner_id = user.id if user else 0
        household = Household(name="My Household", owner_user_id=owner_id)
        db.add(household)

    # ── Assign existing unlocated inventory items to default locations ─────────
    zone_to_loc = {}
    if fridge_loc and fridge_loc.id:
        zone_to_loc["fridge"] = fridge_loc.id
    if freezer_loc and freezer_loc.id:
        zone_to_loc["freezer"] = freezer_loc.id
    if pantry_loc and pantry_loc.id:
        zone_to_loc["pantry"] = pantry_loc.id

    if zone_to_loc:
        unlocated = db.query(InventoryItem).filter(InventoryItem.location_id.is_(None)).all()
        for item in unlocated:
            loc_id = zone_to_loc.get(item.zone)
            if loc_id:
                item.location_id = loc_id

    db.commit()

    # ── Auto-ingest knowledge base (skip if already ingested) ─────────────────
    from app.routers.assistant import ingest_knowledge_base
    ingest_knowledge_base(db, force=False)


migrate_db(engine)

# Seed defaults after all tables exist
_db = SessionLocal()
try:
    _seed_defaults(_db)
finally:
    _db.close()

app = FastAPI(
    title="NutriFridge AI API",
    description="Personalized nutrition + refrigerator inventory assistant",
    version="5.0.0",
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
app.include_router(family.router)
app.include_router(locations.router)
app.include_router(assistant.router)


@app.get("/")
def root():
    return {"message": "NutriFridge AI API is running", "docs": "/docs", "version": "5.0.0"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "NutriFridge AI backend"}
