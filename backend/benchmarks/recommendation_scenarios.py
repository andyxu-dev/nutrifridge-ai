from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any


@dataclass(frozen=True)
class FixtureUser:
    name: str = "Benchmark User"
    height_cm: float = 175.0
    weight_kg: float = 75.0
    age: int = 30
    sex: str = "male"
    activity_level: str = "moderate"
    goal: str = "maintenance"
    dietary_preference: str | None = None
    cuisine_preference: str | None = "mixed"
    cooking_time_preference: str | None = "flexible"
    diet_style: str | None = "balanced"
    disliked_foods: str = "[]"
    preferred_foods: str = "[]"
    health_conditions: str = "[]"
    allergies: str = "[]"
    strict_avoid_foods: str = "[]"
    macro_strategy: str | None = "standard"
    custom_calorie_target: float | None = None
    custom_protein_g: float | None = None
    custom_carbs_g: float | None = None
    custom_fat_g: float | None = None


@dataclass(frozen=True)
class FixtureInventoryItem:
    id: int
    name: str
    category: str
    best_before_date: date | None
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    quantity: float = 600.0
    unit: str = "g"
    zone: str = "fridge"
    notes: str | None = None
    location_id: int | None = None


@dataclass(frozen=True)
class RecommendationScenario:
    name: str
    user: FixtureUser
    inventory: list[FixtureInventoryItem]
    remaining_macros: dict[str, float]
    consumed: dict[str, float] = field(
        default_factory=lambda: {
            "calories": 0.0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
        }
    )
    must_pass: tuple[str, ...] = ()
    notes: str = ""


def _json_list(values: list[str]) -> str:
    return json.dumps(values)


def _user(**overrides: Any) -> FixtureUser:
    values = FixtureUser().__dict__ | overrides
    return FixtureUser(**values)


def _item(
    item_id: int,
    name: str,
    category: str,
    days: int | None,
    *,
    calories: float,
    protein: float,
    carbs: float,
    fat: float,
    quantity: float = 600.0,
) -> FixtureInventoryItem:
    best_before = None if days is None else date.today() + timedelta(days=days)
    return FixtureInventoryItem(
        id=item_id,
        name=name,
        category=category,
        best_before_date=best_before,
        calories_per_100g=calories,
        protein_per_100g=protein,
        carbs_per_100g=carbs,
        fat_per_100g=fat,
        quantity=quantity,
    )


def _balanced_inventory(start_id: int = 1) -> list[FixtureInventoryItem]:
    return [
        _item(start_id, "Chicken Breast", "meat", 7, calories=165, protein=31, carbs=0, fat=3.6),
        _item(start_id + 1, "Spinach", "vegetable", 4, calories=23, protein=2.9, carbs=3.6, fat=0.4),
        _item(start_id + 2, "Cooked Rice", "grain", 6, calories=130, protein=2.7, carbs=28, fat=0.3),
        _item(start_id + 3, "Greek Yogurt", "dairy", 7, calories=59, protein=10, carbs=3.6, fat=0.4),
        _item(start_id + 4, "Strawberries", "fruit", 5, calories=32, protein=0.7, carbs=7.7, fat=0.3),
        _item(start_id + 5, "Eggs", "other", 10, calories=155, protein=13, carbs=1.1, fat=11),
        _item(start_id + 6, "Garlic", "condiment", 20, calories=149, protein=6.4, carbs=33, fat=0.5),
    ]


def load_scenarios() -> list[RecommendationScenario]:
    base_remaining = {"calories": 1800.0, "protein_g": 95.0, "carbs_g": 210.0, "fat_g": 60.0}
    near_limit = {"calories": 90.0, "protein_g": 8.0, "carbs_g": 12.0, "fat_g": 5.0}

    return [
        RecommendationScenario(
            name="balanced_inventory",
            user=_user(),
            inventory=_balanced_inventory(),
            remaining_macros=base_remaining,
            notes="Normal mixed inventory with no exclusions.",
        ),
        RecommendationScenario(
            name="high_protein_gap",
            user=_user(diet_style="high_protein", macro_strategy="high_protein"),
            inventory=_balanced_inventory(20),
            remaining_macros={"calories": 1800.0, "protein_g": 170.0, "carbs_g": 170.0, "fat_g": 55.0},
            notes="Large remaining protein need should raise protein_gap components.",
        ),
        RecommendationScenario(
            name="protein_already_satisfied",
            user=_user(diet_style="high_protein", macro_strategy="high_protein"),
            inventory=_balanced_inventory(40),
            remaining_macros={"calories": 1800.0, "protein_g": 4.0, "carbs_g": 170.0, "fat_g": 55.0},
            notes="Tiny protein gap should reduce protein_gap components to current scorer floor.",
        ),
        RecommendationScenario(
            name="near_calorie_limit",
            user=_user(),
            inventory=_balanced_inventory(60),
            remaining_macros=near_limit,
            notes="Near exhausted calorie budget exposes calorie_fit overshoot behavior.",
        ),
        RecommendationScenario(
            name="use_soon_inventory",
            user=_user(),
            inventory=[
                _item(80, "Chicken Breast", "meat", 2, calories=165, protein=31, carbs=0, fat=3.6),
                _item(81, "Spinach", "vegetable", 5, calories=23, protein=2.9, carbs=3.6, fat=0.4),
                _item(82, "Cooked Rice", "grain", 7, calories=130, protein=2.7, carbs=28, fat=0.3),
                _item(83, "Greek Yogurt", "dairy", 8, calories=59, protein=10, carbs=3.6, fat=0.4),
            ],
            remaining_macros=base_remaining,
            notes="High/medium risk items are usable use-soon ingredients.",
        ),
        RecommendationScenario(
            name="expired_inventory",
            user=_user(),
            inventory=[
                _item(100, "Expired Chicken Breast", "meat", -1, calories=165, protein=31, carbs=0, fat=3.6),
                _item(101, "Spinach", "vegetable", 4, calories=23, protein=2.9, carbs=3.6, fat=0.4),
                _item(102, "Cooked Rice", "grain", 6, calories=130, protein=2.7, carbs=28, fat=0.3),
            ],
            remaining_macros=base_remaining,
            notes="Expired ingredients are tracked separately, not treated as desirable benchmark success.",
        ),
        RecommendationScenario(
            name="strict_avoid_pork",
            user=_user(strict_avoid_foods=_json_list(["pork"])),
            inventory=[
                _item(120, "Pork Tenderloin", "meat", 2, calories=242, protein=27, carbs=0, fat=14),
                _item(121, "Chicken Breast", "meat", 7, calories=165, protein=31, carbs=0, fat=3.6),
                _item(122, "Cooked Rice", "grain", 3, calories=130, protein=2.7, carbs=28, fat=0.3),
                _item(123, "Spinach", "vegetable", 4, calories=23, protein=2.9, carbs=3.6, fat=0.4),
            ],
            remaining_macros=base_remaining,
            must_pass=("hard_exclusion_safety",),
            notes="Pork must not appear in matched inventory or template metadata.",
        ),
        RecommendationScenario(
            name="dairy_hard_exclusion",
            user=_user(allergies=_json_list(["dairy"])),
            inventory=[
                _item(140, "Greek Yogurt", "dairy", 2, calories=59, protein=10, carbs=3.6, fat=0.4),
                _item(141, "Chicken Breast", "meat", 6, calories=165, protein=31, carbs=0, fat=3.6),
                _item(142, "Spinach", "vegetable", 4, calories=23, protein=2.9, carbs=3.6, fat=0.4),
                _item(143, "Cooked Rice", "grain", 4, calories=130, protein=2.7, carbs=28, fat=0.3),
            ],
            remaining_macros=base_remaining,
            must_pass=("hard_exclusion_safety",),
            notes="Category-level dairy exclusion must block dairy items and dairy templates.",
        ),
        RecommendationScenario(
            name="ham_vs_chamomile",
            user=_user(strict_avoid_foods=_json_list(["ham"])),
            inventory=[
                _item(160, "Chamomile Oats", "grain", 4, calories=120, protein=8, carbs=20, fat=2),
                _item(161, "Strawberries", "fruit", 5, calories=32, protein=0.7, carbs=7.7, fat=0.3),
            ],
            remaining_macros=base_remaining,
            must_pass=("hard_exclusion_safety", "word_boundary"),
            notes="The letters in chamomile must not match the food term ham.",
        ),
        RecommendationScenario(
            name="sparse_safe_inventory",
            user=_user(),
            inventory=[
                _item(180, "Cooked Rice", "grain", 3, calories=130, protein=2.7, carbs=28, fat=0.3),
            ],
            remaining_macros=base_remaining,
            notes="Sparse inventory may produce fewer than four recommendations.",
        ),
        RecommendationScenario(
            name="only_excluded_inventory",
            user=_user(strict_avoid_foods=_json_list(["meat", "dairy", "grain", "vegetable", "fruit", "other", "condiment"])),
            inventory=_balanced_inventory(200),
            remaining_macros=base_remaining,
            must_pass=("hard_exclusion_safety", "no_excluded_recommendations"),
            notes="All inventory categories are hard-excluded; no violating recommendation may appear.",
        ),
        RecommendationScenario(
            name="conflicting_urgency_vs_protein",
            user=_user(),
            inventory=[
                _item(220, "Strawberries", "fruit", 1, calories=32, protein=0.7, carbs=7.7, fat=0.3),
                _item(221, "Spinach", "vegetable", 1, calories=23, protein=2.9, carbs=3.6, fat=0.4),
                _item(222, "Chicken Breast", "meat", 14, calories=165, protein=31, carbs=0, fat=3.6),
                _item(223, "Cooked Rice", "grain", 14, calories=130, protein=2.7, carbs=28, fat=0.3),
            ],
            remaining_macros={"calories": 1600.0, "protein_g": 160.0, "carbs_g": 150.0, "fat_g": 45.0},
            notes="Exposes urgency versus protein-gap tradeoffs without declaring a winner.",
        ),
        RecommendationScenario(
            name="deterministic_repeat",
            user=_user(),
            inventory=_balanced_inventory(240),
            remaining_macros=base_remaining,
            must_pass=("deterministic_repeat",),
            notes="Controlled fixture should produce the same semantic output repeatedly.",
        ),
        RecommendationScenario(
            name="family_union_exclusion",
            user=_user(allergies=_json_list(["dairy"])),
            inventory=[
                _item(260, "Greek Yogurt", "dairy", 2, calories=59, protein=10, carbs=3.6, fat=0.4),
                _item(261, "Chicken Breast", "meat", 5, calories=165, protein=31, carbs=0, fat=3.6),
                _item(262, "Spinach", "vegetable", 4, calories=23, protein=2.9, carbs=3.6, fat=0.4),
                _item(263, "Cooked Rice", "grain", 4, calories=130, protein=2.7, carbs=28, fat=0.3),
            ],
            remaining_macros={"calories": 3600.0, "protein_g": 190.0, "carbs_g": 420.0, "fat_g": 120.0},
            must_pass=("hard_exclusion_safety", "family_union_exclusion"),
            notes="Service-level composite user represents the family union of hard exclusions.",
        ),
    ]
