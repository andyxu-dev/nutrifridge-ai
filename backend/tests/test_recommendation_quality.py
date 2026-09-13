from benchmarks.recommendation_benchmark import run_scenario
from benchmarks.recommendation_scenarios import load_scenarios


def _scenario(name: str):
    return next(scenario for scenario in load_scenarios() if scenario.name == name)


def test_pork_hard_exclusion_has_zero_violations():
    result = run_scenario(_scenario("strict_avoid_pork"))

    assert result.hard_violation_count == 0
    assert result.must_pass_results["hard_exclusion_safety"] is True


def test_dairy_hard_exclusion_has_zero_violations():
    result = run_scenario(_scenario("dairy_hard_exclusion"))

    assert result.hard_violation_count == 0
    assert result.must_pass_results["hard_exclusion_safety"] is True


def test_ham_word_boundary_does_not_exclude_chamomile():
    result = run_scenario(_scenario("ham_vs_chamomile"))

    assert result.hard_violation_count == 0
    assert result.must_pass_results["word_boundary"] is True


def test_only_excluded_inventory_produces_no_violating_recommendations():
    result = run_scenario(_scenario("only_excluded_inventory"))

    assert result.hard_violation_count == 0
    assert result.recommendation_count == 0


def test_deterministic_repeat_signature_is_stable():
    result = run_scenario(_scenario("deterministic_repeat"))
    repeated = run_scenario(_scenario("deterministic_repeat"))

    assert result.must_pass_results["deterministic_repeat"] is True
    assert result.deterministic_signature == repeated.deterministic_signature


def test_protein_gap_component_responds_to_remaining_need():
    high_gap = run_scenario(_scenario("high_protein_gap"))
    low_gap = run_scenario(_scenario("protein_already_satisfied"))

    assert max(high_gap.protein_gap_scores.values()) >= max(low_gap.protein_gap_scores.values())
