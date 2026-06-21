package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AllergyPolicyTest {

    private final AllergyPolicy policy = new AllergyPolicy();

    private UserProfileDto profile(List<String> allergies, List<String> strictAvoid) {
        return new UserProfileDto("Test", 30, "male", 170, 70,
                "moderate", "maintenance", null, List.of(), allergies, strictAvoid);
    }

    @Test
    void appliesWhenAllergyPresent() {
        assertThat(policy.appliesTo(profile(List.of("peanut"), List.of()))).isTrue();
    }

    @Test
    void appliesWhenStrictAvoidPresent() {
        assertThat(policy.appliesTo(profile(List.of(), List.of("shellfish")))).isTrue();
    }

    @Test
    void doesNotApplyWhenNoAllergyOrAvoidance() {
        assertThat(policy.appliesTo(profile(List.of(), List.of()))).isFalse();
    }

    @Test
    void hardExcludesAllAllergenFragments() {
        Set<String> excluded = policy.hardExcludedFoodFragments(
                profile(List.of("Peanut", "SHELLFISH"), List.of("AlcoHol")));
        assertThat(excluded).containsExactlyInAnyOrder("peanut", "shellfish", "alcohol");
    }

    @Test
    void hardExcludesCombinesAllergiesAndStrictAvoid() {
        Set<String> excluded = policy.hardExcludedFoodFragments(
                profile(List.of("peanut"), List.of("shellfish", "liver")));
        assertThat(excluded).containsExactlyInAnyOrder("peanut", "shellfish", "liver");
    }

    @Test
    void doesNotAdjustMacroTargets() {
        MacroTotals base = new MacroTotals(2000, 150, 200, 65);
        MacroTotals adjusted = policy.adjustTarget(base, profile(List.of("peanut"), List.of()));
        assertThat(adjusted).isEqualTo(base);
    }

    @Test
    void tagPenaltiesAreEmpty() {
        assertThat(policy.tagPenalties()).isEmpty();
    }

    @Test
    void warningsAreEmpty() {
        MacroTotals consumed = new MacroTotals(1500, 100, 150, 50);
        MacroTotals target   = new MacroTotals(2000, 150, 200, 65);
        assertThat(policy.warnings(consumed, target, profile(List.of("peanut"), List.of()))).isEmpty();
    }
}
