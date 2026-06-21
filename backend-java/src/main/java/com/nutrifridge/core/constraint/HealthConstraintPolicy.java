package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Strategy interface for a single health constraint or dietary restriction.
 *
 * Implementations are collected by {@link com.nutrifridge.core.service.HealthConstraintService},
 * which calls each one that {@link #appliesTo} the current user profile.
 *
 * Each policy is responsible for exactly one concern (SRP), making it easy to
 * add new conditions without modifying existing code (OCP).
 */
public interface HealthConstraintPolicy {

    /** Human-readable key identifying this constraint (e.g. "fatty_liver"). */
    String conditionKey();

    /** True when this policy should be applied for the given user profile. */
    boolean appliesTo(UserProfileDto profile);

    /**
     * Adjust macro targets based on this condition.
     * Implementations should only reduce targets they are specifically responsible for;
     * callers will chain multiple policies together.
     */
    MacroTotals adjustTarget(MacroTotals baseTarget, UserProfileDto profile);

    /**
     * Food name fragments that must be hard-excluded from all meal plans.
     * Any inventory item whose name (lowercased) contains one of these fragments
     * will be removed before scoring.
     */
    Set<String> hardExcludedFoodFragments(UserProfileDto profile);

    /**
     * Meal template tag → penalty score mapping.
     * Applied during meal scoring to discourage tags that are harmful for this condition.
     * Positive values are bonuses; negative values are penalties.
     */
    Map<String, Double> tagPenalties();

    /**
     * Generate user-facing health warnings based on today's consumption vs targets.
     * Returns an empty list when no warnings are warranted.
     */
    List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile);
}
