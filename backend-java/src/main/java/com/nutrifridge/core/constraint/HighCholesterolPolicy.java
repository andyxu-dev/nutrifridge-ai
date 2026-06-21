package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class HighCholesterolPolicy implements HealthConstraintPolicy {

    @Override
    public String conditionKey() { return "high_cholesterol"; }

    @Override
    public boolean appliesTo(UserProfileDto profile) {
        return profile.safeConditions().contains("high_cholesterol");
    }

    @Override
    public MacroTotals adjustTarget(MacroTotals base, UserProfileDto profile) {
        // Cap saturated fat proxy: overall fat cap at 25% of calories
        double maxFatG = base.calories() * 0.25 / 9.0;
        return new MacroTotals(base.calories(), base.proteinG(), base.carbsG(),
                Math.min(base.fatG(), maxFatG));
    }

    @Override
    public Set<String> hardExcludedFoodFragments(UserProfileDto profile) {
        return Set.of();
    }

    @Override
    public Map<String, Double> tagPenalties() {
        return Map.of("high_fat", -10.0, "saturated_fat", -15.0);
    }

    @Override
    public List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile) {
        if (target.fatG() > 0 && consumed.fatG() / target.fatG() > 0.90) {
            return List.of("Fat intake is near your daily limit — prioritise lean protein and avoid processed meats.");
        }
        return List.of();
    }
}
