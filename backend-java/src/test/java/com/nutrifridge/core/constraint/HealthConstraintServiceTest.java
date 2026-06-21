package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import com.nutrifridge.core.service.HealthConstraintService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HealthConstraintServiceTest {

    @Mock FattyLiverPolicy fattyLiverPolicy;
    @Mock DiabetesPolicy   diabetesPolicy;
    @Mock AllergyPolicy    allergyPolicy;

    HealthConstraintService service;

    @BeforeEach
    void setUp() {
        service = new HealthConstraintService(List.of(fattyLiverPolicy, diabetesPolicy, allergyPolicy));
    }

    private UserProfileDto profile(List<String> conditions, List<String> allergies) {
        return new UserProfileDto("Test", 30, "male", 170, 70,
                "moderate", "maintenance", null, conditions, allergies, List.of());
    }

    @Test
    void selectPolicies_onlyReturnsApplicable() {
        UserProfileDto p = profile(List.of("fatty_liver"), List.of());
        when(fattyLiverPolicy.appliesTo(p)).thenReturn(true);
        when(diabetesPolicy.appliesTo(p)).thenReturn(false);
        when(allergyPolicy.appliesTo(p)).thenReturn(false);

        assertThat(service.selectPolicies(p)).containsOnly(fattyLiverPolicy);
    }

    @Test
    void adjustTarget_chainsAllApplicablePolicies() {
        UserProfileDto p = profile(List.of("fatty_liver", "diabetes"), List.of());
        MacroTotals base = new MacroTotals(2000, 150, 200, 70);
        MacroTotals afterFattyLiver = new MacroTotals(2000, 150, 200, 49);   // fat capped
        MacroTotals afterDiabetes   = new MacroTotals(2000, 150, 200, 49);   // carbs already ok

        when(fattyLiverPolicy.appliesTo(p)).thenReturn(true);
        when(diabetesPolicy.appliesTo(p)).thenReturn(true);
        when(allergyPolicy.appliesTo(p)).thenReturn(false);
        when(fattyLiverPolicy.adjustTarget(base, p)).thenReturn(afterFattyLiver);
        when(diabetesPolicy.adjustTarget(afterFattyLiver, p)).thenReturn(afterDiabetes);

        MacroTotals result = service.adjustTarget(base, p);
        assertThat(result.fatG()).isLessThanOrEqualTo(70);
    }

    @Test
    void collectExcludedFragments_mergesAcrossPolicies() {
        UserProfileDto p = profile(List.of(), List.of("peanut"));
        when(fattyLiverPolicy.appliesTo(p)).thenReturn(false);
        when(diabetesPolicy.appliesTo(p)).thenReturn(false);
        when(allergyPolicy.appliesTo(p)).thenReturn(true);
        when(allergyPolicy.hardExcludedFoodFragments(p)).thenReturn(Set.of("peanut"));

        assertThat(service.collectExcludedFragments(p)).contains("peanut");
    }

    @Test
    void generateWarnings_aggregatesAcrossPolicies() {
        UserProfileDto p = profile(List.of("fatty_liver"), List.of());
        MacroTotals consumed = new MacroTotals(1800, 100, 150, 45);
        MacroTotals target   = new MacroTotals(2000, 150, 200, 49);

        when(fattyLiverPolicy.appliesTo(p)).thenReturn(true);
        when(diabetesPolicy.appliesTo(p)).thenReturn(false);
        when(allergyPolicy.appliesTo(p)).thenReturn(false);
        when(fattyLiverPolicy.warnings(consumed, target, p))
                .thenReturn(List.of("Approaching fat limit."));

        List<String> warnings = service.generateWarnings(consumed, target, p);
        assertThat(warnings).containsExactly("Approaching fat limit.");
    }

    @Test
    void collectTagPenalties_sumsSameTags() {
        UserProfileDto p = profile(List.of("fatty_liver", "high_cholesterol"), List.of());
        when(fattyLiverPolicy.appliesTo(p)).thenReturn(true);
        when(diabetesPolicy.appliesTo(p)).thenReturn(false);
        when(allergyPolicy.appliesTo(p)).thenReturn(false);
        when(fattyLiverPolicy.tagPenalties()).thenReturn(Map.of("high_fat", -15.0));

        Map<String, Double> penalties = service.collectTagPenalties(p);
        assertThat(penalties).containsEntry("high_fat", -15.0);
    }
}
