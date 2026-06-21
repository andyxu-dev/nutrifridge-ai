package com.nutrifridge.core.service;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Mifflin-St Jeor BMR → TDEE → goal-adjusted calorie and macro targets.
 * Matches the Python nutrition_engine.py calculation for cross-service consistency.
 */
@Component
public class NutritionTargetCalculator {

    private static final Map<String, Double> ACTIVITY_MULTIPLIERS = Map.of(
            "sedentary",  1.2,
            "light",      1.375,
            "moderate",   1.55,
            "active",     1.725,
            "very_active",1.9
    );

    private static final Map<String, Integer> GOAL_ADJUSTMENTS = Map.of(
            "fat_loss",    -400,
            "maintenance",    0,
            "muscle_gain", +300
    );

    public MacroTotals calculate(UserProfileDto profile) {
        double bmr = computeBmr(profile);
        double activityFactor = ACTIVITY_MULTIPLIERS.getOrDefault(profile.activityLevel(), 1.55);
        double tdee = bmr * activityFactor;
        int goalAdj = GOAL_ADJUSTMENTS.getOrDefault(profile.goal(), 0);
        double calories = Math.round(tdee + goalAdj);

        // Standard macro split: 30% protein, 40% carbs, 30% fat
        double proteinG = Math.round(calories * 0.30 / 4.0);
        double carbsG   = Math.round(calories * 0.40 / 4.0);
        double fatG     = Math.round(calories * 0.30 / 9.0);

        return new MacroTotals(calories, proteinG, carbsG, fatG);
    }

    private double computeBmr(UserProfileDto profile) {
        double base = 10 * profile.weightKg()
                + 6.25 * profile.heightCm()
                - 5   * profile.ageYears();
        return "female".equalsIgnoreCase(profile.sex()) ? base - 161 : base + 5;
    }
}
