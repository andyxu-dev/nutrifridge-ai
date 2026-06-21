package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Lactose intolerance: hard-excludes common dairy products from meal plans.
 * Treated as a hard exclusion (like an allergy) rather than a soft penalty.
 */
@Component
public class LactoseIntolerancePolicy implements HealthConstraintPolicy {

    private static final Set<String> DAIRY_FRAGMENTS =
            Set.of("milk", "yogurt", "yoghurt", "cheese", "butter", "cream", "whey", "ricotta", "kefir");

    @Override
    public String conditionKey() { return "lactose_intolerance"; }

    @Override
    public boolean appliesTo(UserProfileDto profile) {
        List<String> conditions = profile.safeConditions();
        return conditions.contains("lactose_intolerance") || conditions.contains("celiac");
    }

    @Override
    public MacroTotals adjustTarget(MacroTotals base, UserProfileDto profile) {
        return base;
    }

    @Override
    public Set<String> hardExcludedFoodFragments(UserProfileDto profile) {
        return DAIRY_FRAGMENTS;
    }

    @Override
    public Map<String, Double> tagPenalties() {
        return Map.of("dairy", -25.0);
    }

    @Override
    public List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile) {
        return List.of();
    }
}
