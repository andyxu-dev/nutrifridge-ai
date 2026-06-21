package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Type 2 Diabetes / Prediabetes constraint:
 *  - Caps carbohydrates at 40% of total calories (moderate-low carb approach).
 *  - Penalises high-carb meal templates.
 *  - Warns when carb consumption is high relative to target.
 */
@Component
public class DiabetesPolicy implements HealthConstraintPolicy {

    private static final double MAX_CARB_PCT  = 0.40;
    private static final double CARB_KCAL_PER_G = 4.0;

    @Override
    public String conditionKey() { return "diabetes"; }

    @Override
    public boolean appliesTo(UserProfileDto profile) {
        List<String> conditions = profile.safeConditions();
        return conditions.contains("diabetes") || conditions.contains("prediabetes");
    }

    @Override
    public MacroTotals adjustTarget(MacroTotals base, UserProfileDto profile) {
        double maxCarbsG = base.calories() * MAX_CARB_PCT / CARB_KCAL_PER_G;
        return new MacroTotals(
                base.calories(),
                base.proteinG(),
                Math.min(base.carbsG(), maxCarbsG),
                base.fatG()
        );
    }

    @Override
    public Set<String> hardExcludedFoodFragments(UserProfileDto profile) {
        return Set.of(); // Dietary management, not outright exclusion
    }

    @Override
    public Map<String, Double> tagPenalties() {
        return Map.of("high_carb", -15.0, "sugary", -20.0);
    }

    @Override
    public List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile) {
        List<String> warnings = new ArrayList<>();
        if (target.carbsG() > 0 && consumed.carbsG() / target.carbsG() > 0.90) {
            warnings.add("Carbohydrate intake is near the daily limit — pair remaining carbs with protein and fibre.");
        }
        return warnings;
    }
}
