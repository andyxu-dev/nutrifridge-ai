package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Allergy / strict-avoidance constraint.
 *
 * Hard exclusion: any inventory item whose name contains an allergen fragment
 * is removed from the candidate set entirely — the meal is never scored or shown.
 * This differs from soft dislikes (score penalty only).
 *
 * Note: macro targets are unchanged by allergies; only food selection is affected.
 */
@Component
public class AllergyPolicy implements HealthConstraintPolicy {

    @Override
    public String conditionKey() { return "allergy"; }

    @Override
    public boolean appliesTo(UserProfileDto profile) {
        return !profile.safeAllergies().isEmpty() || !profile.safeStrictAvoid().isEmpty();
    }

    @Override
    public MacroTotals adjustTarget(MacroTotals base, UserProfileDto profile) {
        return base; // Allergies do not change macro targets
    }

    @Override
    public Set<String> hardExcludedFoodFragments(UserProfileDto profile) {
        return Stream.concat(
                        profile.safeAllergies().stream(),
                        profile.safeStrictAvoid().stream())
                .map(String::toLowerCase)
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public Map<String, Double> tagPenalties() {
        return Map.of(); // Hard exclusion does all the work; no tag-level penalty needed
    }

    @Override
    public List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile) {
        return List.of(); // Exclusion is silent (item simply absent from suggestions)
    }
}
