import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import assistant as assistant_models  # noqa: F401
from app.models import household as household_models  # noqa: F401
from app.models import inventory as inventory_models  # noqa: F401
from app.models import location as location_models  # noqa: F401
from app.models import nutrition_log as nutrition_models  # noqa: F401
from app.models import user as user_models  # noqa: F401
from app.models import waste_log as waste_log_models  # noqa: F401
from app.models.inventory import InventoryItem
from app.models.user import User
from app.routers.grocery_list import get_weekly_grocery_list
from app.services.health_constraint_engine import (
    contains_food_term,
    is_hard_excluded_item,
)
from app.services.meal_planner import generate_meal_plan
from app.services.meal_scorer import score_meal
from app.services.meal_templates import get_all_templates


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user(**overrides) -> User:
    values = {
        "name": "QA User",
        "height_cm": 175.0,
        "weight_kg": 75.0,
        "age": 30,
        "sex": "male",
        "activity_level": "moderate",
        "goal": "maintenance",
        "allergies": "[]",
        "strict_avoid_foods": "[]",
        "health_conditions": "[]",
    }
    values.update(overrides)
    return User(**values)


def _inventory_item(name: str, category: str, item_id: int = 1) -> InventoryItem:
    return InventoryItem(
        id=item_id,
        name=name,
        quantity=100.0,
        unit="g",
        zone="pantry",
        category=category,
        calories_per_100g=120.0,
        protein_per_100g=8.0,
        carbs_per_100g=20.0,
        fat_per_100g=2.0,
    )


def test_shared_hard_exclusion_matcher_semantics():
    excluded = {"pork", "dairy", "greek yogurt", "ham"}

    assert is_hard_excluded_item("Pork Tenderloin", "meat", excluded)
    assert is_hard_excluded_item("Plain Yogurt", "dairy", excluded)
    assert is_hard_excluded_item("Greek   Yogurt", "snack", excluded)
    assert not is_hard_excluded_item("Chamomile Tea", "beverage", excluded)
    assert contains_food_term("Greek Yogurt Parfait", "greek yogurt")
    assert not contains_food_term("Chamomile Tea", "ham")


def test_pork_blocks_pork_template():
    user = _user(strict_avoid_foods=json.dumps(["pork"]))
    pork_template = next(t for t in get_all_templates() if "Pork" in t["name"])

    result = score_meal(
        pork_template,
        [_inventory_item("Generic protein", "meat")],
        user,
        {"calories": 1000, "protein_g": 100, "carbs_g": 100, "fat_g": 40},
        {"calories": 200, "protein_g": 20, "carbs_g": 20, "fat_g": 5},
    )

    assert result["excluded"] is True
    assert result["breakdown"]["allergy_exclusion"] == -100.0


def test_dairy_category_blocks_grocery_recommendations(db_session):
    user = _user(allergies=json.dumps(["dairy"]))
    db_session.add(user)
    db_session.commit()

    result = get_weekly_grocery_list(db_session)

    assert all(
        item["category"].lower() != "dairy"
        for item in result["recommended_to_buy"]
    )


def test_ham_does_not_match_chamomile_across_scorer_planner_and_grocery(
    db_session,
):
    user = _user(allergies=json.dumps(["ham"]))
    chamomile_oats = _inventory_item("Chamomile Oats", "grain")
    db_session.add(user)
    db_session.add(chamomile_oats)
    db_session.commit()

    template = next(t for t in get_all_templates() if t["name"] == "Oatmeal Breakfast Bowl")
    score = score_meal(
        template,
        [chamomile_oats],
        user,
        {"calories": 1000, "protein_g": 100, "carbs_g": 100, "fat_g": 40},
        {"calories": 200, "protein_g": 20, "carbs_g": 20, "fat_g": 5},
    )
    plan = generate_meal_plan(
        user,
        [chamomile_oats],
        remaining_macros={"calories": 1000, "protein_g": 100, "carbs_g": 100, "fat_g": 40},
    )
    grocery = get_weekly_grocery_list(db_session)

    assert score["excluded"] is False
    assert any(
        ingredient["name"] == "Chamomile Oats"
        for meal in plan["meals"]
        for ingredient in meal["ingredients"]
    )
    assert any(
        item["name"] == "Chamomile Oats"
        for item in grocery["recommended_to_buy"]
    )
