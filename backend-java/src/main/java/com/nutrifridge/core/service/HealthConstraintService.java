package com.nutrifridge.core.service;

import com.nutrifridge.core.constraint.HealthConstraintPolicy;
import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Aggregates all registered {@link HealthConstraintPolicy} beans and applies
 * only those relevant to the current user profile (Strategy pattern dispatch).
 *
 * Spring auto-discovers implementations via @Component scanning and injects
 * them as a List — adding a new condition requires only a new @Component class.
 */
@Service
public class HealthConstraintService {

    private final List<HealthConstraintPolicy> policies;

    public HealthConstraintService(List<HealthConstraintPolicy> policies) {
        this.policies = policies;
    }

    /** Return only policies that apply to this user. */
    public List<HealthConstraintPolicy> selectPolicies(UserProfileDto profile) {
        return policies.stream()
                .filter(p -> p.appliesTo(profile))
                .toList();
    }

    /** Apply all applicable policies in sequence to adjust macro targets. */
    public MacroTotals adjustTarget(MacroTotals baseTarget, UserProfileDto profile) {
        MacroTotals adjusted = baseTarget;
        for (HealthConstraintPolicy policy : selectPolicies(profile)) {
            adjusted = policy.adjustTarget(adjusted, profile);
        }
        return adjusted.rounded();
    }

    /** Collect all hard-excluded food fragments across applicable policies. */
    public Set<String> collectExcludedFragments(UserProfileDto profile) {
        Set<String> excluded = new HashSet<>();
        for (HealthConstraintPolicy policy : selectPolicies(profile)) {
            excluded.addAll(policy.hardExcludedFoodFragments(profile));
        }
        return excluded;
    }

    /** Collect all tag penalties across applicable policies. */
    public java.util.Map<String, Double> collectTagPenalties(UserProfileDto profile) {
        java.util.Map<String, Double> penalties = new java.util.HashMap<>();
        for (HealthConstraintPolicy policy : selectPolicies(profile)) {
            policy.tagPenalties().forEach(
                    (tag, penalty) -> penalties.merge(tag, penalty, Double::sum));
        }
        return penalties;
    }

    /** Collect all user-facing health warnings for today's consumption. */
    public List<String> generateWarnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile) {
        List<String> warnings = new ArrayList<>();
        for (HealthConstraintPolicy policy : selectPolicies(profile)) {
            warnings.addAll(policy.warnings(consumed, target, profile));
        }
        return warnings;
    }
}
