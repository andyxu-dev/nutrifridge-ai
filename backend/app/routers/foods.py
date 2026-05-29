from fastapi import APIRouter, Query

from app.services.food_database import FOOD_DB, search_foods

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("")
def get_all_foods():
    return FOOD_DB


@router.get("/search")
def search(q: str = Query(..., min_length=1, description="Search query (name or alias)")):
    return search_foods(q)
