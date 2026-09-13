from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from statistics import mean
from typing import Any

from app.services.expiration_engine import get_expiration_risk
from app.services.health_constraint_engine import (
    contains_food_term,
    get_hard_excluded_foods,
    is_hard_excluded_item,
)
from app.services.meal_planner import generate_meal_plan
from app.services.meal_templates import get_all_templates
from benchmarks.recommendation_scenarios import (
    FixtureInventoryItem,
    RecommendationScenario,
    load_scenarios,
)


_IMPLIED_INGREDIENT_TERMS = (
    "beef",
    "pork",
    "chicken",
    "salmon",
    "tuna",
    "shrimp",
    "egg",
    "yogurt",
    "rice",
    "pasta",
    "oat",
    "avocado",
    "tomato",
    "spinach",
    "garlic",
    "broccoli",
)


@dataclass(frozen=True)
class ScenarioResult:
    scenario: str
    recommendation_count: int
    top_meal_by_type: dict[str, str]
    scores: dict[str, float]
    score_breakdown: dict[str, dict[str, float]]
    hard_violation_count: int
    hard_violation_details: list[str]
    protein_gap_scores: dict[str, float]
    calorie_fit_scores: dict[str, float]
    use_soon_matched_count: int
    use_soon_available_count: int
    use_soon_utilization_rate: float | None
    expired_item_selection_count: int
    matched_inventory_count: int
    matched_inventory_categories: list[str]
    deterministic_signature: str
    template_inventory_mismatch_notes: list[str]
    must_pass_results: dict[str, bool]
    notes: str

    @property
    def must_pass_ok(self) -> bool:
        return all(self.must_pass_results.values())


def _template_by_name() -> dict[str, dict[str, Any]]:
    return {template["name"]: template for template in get_all_templates()}


def _template_text(template: dict[str, Any]) -> str:
    instructions = " ".join(str(step) for step in template.get("instructions", []))
    categories = " ".join(
        str(value)
        for key in ("preferred_categories", "required_categories", "tags")
        for value in template.get(key, [])
    )
    return " ".join(
        [
            str(template.get("name", "")),
            str(template.get("cuisine", "")),
            str(template.get("macro_profile", "")),
            instructions,
            categories,
        ]
    )


def _hard_violation_details(scenario: RecommendationScenario, plan: dict[str, Any]) -> list[str]:
    excluded = get_hard_excluded_foods(scenario.user)
    templates = _template_by_name()
    details: list[str] = []

    for meal in plan.get("meals", []):
        template = templates.get(meal.get("name", ""))
        if template:
            text = _template_text(template)
            for term in sorted(excluded):
                if contains_food_term(text, term):
                    details.append(f"{meal.get('meal_type')}: template '{meal.get('name')}' contains {term}")
        for ingredient in meal.get("ingredients", []):
            name = str(ingredient.get("name", ""))
            category = str(ingredient.get("category", ""))
            if not category:
                matched = next(
                    (item for item in scenario.inventory if item.id == ingredient.get("inventory_item_id")),
                    None,
                )
                category = matched.category if matched else ""
            if is_hard_excluded_item(name, category, excluded):
                details.append(f"{meal.get('meal_type')}: ingredient '{name}' violates exclusion")

    return details


def _semantic_signature(plan: dict[str, Any]) -> str:
    semantic_meals = []
    for meal in plan.get("meals", []):
        semantic_meals.append(
            {
                "meal_type": meal.get("meal_type"),
                "name": meal.get("name"),
                "score": meal.get("score"),
                "score_breakdown": meal.get("score_breakdown"),
                "ingredients": [
                    {
                        "inventory_item_id": ingredient.get("inventory_item_id"),
                        "name": ingredient.get("name"),
                        "expiration_risk": ingredient.get("expiration_risk"),
                    }
                    for ingredient in meal.get("ingredients", [])
                ],
            }
        )
    return json.dumps(semantic_meals, sort_keys=True)


def _use_soon_available_count(scenario: RecommendationScenario) -> int:
    excluded = get_hard_excluded_foods(scenario.user)
    return sum(
        1
        for item in scenario.inventory
        if get_expiration_risk(item.best_before_date) in ("high", "medium")
        and not is_hard_excluded_item(item.name, item.category, excluded)
    )


def _selected_items(scenario: RecommendationScenario, plan: dict[str, Any]) -> list[FixtureInventoryItem]:
    by_id = {item.id: item for item in scenario.inventory}
    selected: list[FixtureInventoryItem] = []
    for meal in plan.get("meals", []):
        for ingredient in meal.get("ingredients", []):
            item = by_id.get(ingredient.get("inventory_item_id"))
            if item:
                selected.append(item)
    return selected


def _template_inventory_mismatch_notes(plan: dict[str, Any]) -> list[str]:
    notes: list[str] = []
    for meal in plan.get("meals", []):
        meal_name = str(meal.get("name", "")).lower()
        matched_text = " ".join(
            str(ingredient.get("name", "")).lower()
            for ingredient in meal.get("ingredients", [])
        )
        missing_terms = [
            term
            for term in _IMPLIED_INGREDIENT_TERMS
            if term in meal_name and term not in matched_text
        ]
        if missing_terms:
            notes.append(
                f"{meal.get('meal_type')}: '{meal.get('name')}' implies "
                f"{', '.join(missing_terms)} but matched [{matched_text}]"
            )
    return notes


def run_scenario(scenario: RecommendationScenario) -> ScenarioResult:
    plan = generate_meal_plan(
        scenario.user,
        scenario.inventory,
        remaining_macros=scenario.remaining_macros,
        consumed=scenario.consumed,
    )
    meals = plan.get("meals", [])
    selected = _selected_items(scenario, plan)
    selected_use_soon_ids = {
        item.id
        for item in selected
        if get_expiration_risk(item.best_before_date) in ("high", "medium")
    }
    use_soon_available = _use_soon_available_count(scenario)
    hard_details = _hard_violation_details(scenario, plan)
    signature = _semantic_signature(plan)

    must_pass_results: dict[str, bool] = {}
    for check_name in scenario.must_pass:
        if check_name in {
            "hard_exclusion_safety",
            "no_excluded_recommendations",
            "family_union_exclusion",
        }:
            must_pass_results[check_name] = len(hard_details) == 0
        elif check_name == "word_boundary":
            must_pass_results[check_name] = any(
                ingredient.get("name") == "Chamomile Oats"
                for meal in meals
                for ingredient in meal.get("ingredients", [])
            )
        elif check_name == "deterministic_repeat":
            repeated = generate_meal_plan(
                scenario.user,
                scenario.inventory,
                remaining_macros=scenario.remaining_macros,
                consumed=scenario.consumed,
            )
            must_pass_results[check_name] = signature == _semantic_signature(repeated)
        else:
            must_pass_results[check_name] = False

    return ScenarioResult(
        scenario=scenario.name,
        recommendation_count=len(meals),
        top_meal_by_type={meal["meal_type"]: meal["name"] for meal in meals},
        scores={meal["meal_type"]: meal["score"] for meal in meals},
        score_breakdown={meal["meal_type"]: meal["score_breakdown"] for meal in meals},
        hard_violation_count=len(hard_details),
        hard_violation_details=hard_details,
        protein_gap_scores={
            meal["meal_type"]: meal["score_breakdown"].get("protein_gap", 0.0)
            for meal in meals
        },
        calorie_fit_scores={
            meal["meal_type"]: meal["score_breakdown"].get("calorie_fit", 0.0)
            for meal in meals
        },
        use_soon_matched_count=len(selected_use_soon_ids),
        use_soon_available_count=use_soon_available,
        use_soon_utilization_rate=(
            len(selected_use_soon_ids) / use_soon_available
            if use_soon_available
            else None
        ),
        expired_item_selection_count=sum(
            1 for item in selected if get_expiration_risk(item.best_before_date) == "expired"
        ),
        matched_inventory_count=len(selected),
        matched_inventory_categories=sorted({item.category for item in selected}),
        deterministic_signature=signature,
        template_inventory_mismatch_notes=_template_inventory_mismatch_notes(plan),
        must_pass_results=must_pass_results,
        notes=scenario.notes,
    )


def run_all_scenarios() -> list[ScenarioResult]:
    return [run_scenario(scenario) for scenario in load_scenarios()]


def _format_float(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2f}"


def _mean(values: list[float]) -> float | None:
    return mean(values) if values else None


def print_report(results: list[ScenarioResult]) -> None:
    total_checks = sum(len(result.must_pass_results) for result in results)
    passed_checks = sum(
        1
        for result in results
        for passed in result.must_pass_results.values()
        if passed
    )
    hard_violations = sum(result.hard_violation_count for result in results)
    use_soon_rates = [
        result.use_soon_utilization_rate
        for result in results
        if result.use_soon_utilization_rate is not None
    ]
    inventory_counts = [result.matched_inventory_count for result in results]
    recommendation_counts = [result.recommendation_count for result in results]
    expired_selected = sum(result.expired_item_selection_count for result in results)
    mismatch_count = sum(len(result.template_inventory_mismatch_notes) for result in results)

    print("Recommendation Benchmark Baseline")
    print("=================================")
    print(f"Scenarios: {len(results)}")
    print(f"Must-pass invariants: {passed_checks}/{total_checks} passed")
    print(f"Hard violations: {hard_violations}")
    print(f"Expired items selected: {expired_selected}")
    print(f"Template/inventory mismatch notes: {mismatch_count}")
    print(f"Recommendation count mean: {_format_float(_mean([float(v) for v in recommendation_counts]))}")
    print(f"Matched inventory count mean: {_format_float(_mean([float(v) for v in inventory_counts]))}")
    print(f"Use-soon utilization mean: {_format_float(_mean(use_soon_rates))}")

    high_protein = next((r for r in results if r.scenario == "high_protein_gap"), None)
    low_protein = next((r for r in results if r.scenario == "protein_already_satisfied"), None)
    if high_protein and low_protein:
        print("\nProtein response:")
        print(f"  high-gap protein scores: {high_protein.protein_gap_scores}")
        print(f"  low-gap protein scores:  {low_protein.protein_gap_scores}")

    near_limit = next((r for r in results if r.scenario == "near_calorie_limit"), None)
    if near_limit:
        print("\nCalorie response:")
        print(f"  near-limit calorie-fit scores: {near_limit.calorie_fit_scores}")

    print("\nPer-scenario results:")
    for result in results:
        print(f"\n- {result.scenario}")
        print(f"  recommendations: {result.recommendation_count}")
        print(f"  top_meal_by_type: {result.top_meal_by_type}")
        print(f"  scores: {result.scores}")
        print(f"  protein_gap_scores: {result.protein_gap_scores}")
        print(f"  calorie_fit_scores: {result.calorie_fit_scores}")
        print(
            "  use_soon: "
            f"{result.use_soon_matched_count}/{result.use_soon_available_count} "
            f"rate={_format_float(result.use_soon_utilization_rate)}"
        )
        print(f"  expired_item_selection_count: {result.expired_item_selection_count}")
        print(f"  matched_inventory_categories: {result.matched_inventory_categories}")
        if result.must_pass_results:
            print(f"  must_pass: {result.must_pass_results}")
        if result.hard_violation_details:
            print(f"  hard_violation_details: {result.hard_violation_details}")
        if result.template_inventory_mismatch_notes:
            print(f"  mismatch_notes: {result.template_inventory_mismatch_notes}")
        if result.notes:
            print(f"  notes: {result.notes}")


def main() -> int:
    try:
        results = run_all_scenarios()
    except Exception as exc:
        print(f"Benchmark execution failed: {exc}", file=sys.stderr)
        return 1

    print_report(results)
    if any(not result.must_pass_ok for result in results):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
