package com.nutrifridge.core.constraint;

import com.nutrifridge.core.dto.MacroTotals;
import com.nutrifridge.core.dto.UserProfileDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Fatty Liver (NAFLD) constraint:
 *  - Caps dietary fat at 22% of total calories (WHO guideline for NAFLD).
 *  - Penalises high-fat and fried meal templates.
 *  - Warns when fat consumption approaches the daily ceiling.
 */
@Component
public class FattyLiverPolicy implements HealthConstraintPolicy {

    private static final double MAX_FAT_PCT = 0.22;
    private static final double FAT_KCAL_PER_G = 9.0;

    @Override
    public String conditionKey() { return "fatty_liver"; }

    @Override
    public boolean appliesTo(UserProfileDto profile) {
        return profile.safeConditions().contains("fatty_liver");
    }

    @Override
    public MacroTotals adjustTarget(MacroTotals base, UserProfileDto profile) {
        double maxFatG = base.calories() * MAX_FAT_PCT / FAT_KCAL_PER_G;
        return new MacroTotals(
                base.calories(),
                base.proteinG(),
                base.carbsG(),
                Math.min(base.fatG(), maxFatG)
        );
    }

    @Override
    public Set<String> hardExcludedFoodFragments(UserProfileDto profile) {
        return Set.of(); // No hard exclusions; only scoring penalties
    }

    @Override
    public Map<String, Double> tagPenalties() {
        return Map.of(
                "high_fat", -15.0,
                "fried",    -20.0
        );
    }

    @Override
    public List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile) {
        List<String> warnings = new ArrayList<>();
        if (target.fatG() > 0 && consumed.fatG() / target.fatG() > 0.85) {
            warnings.add("Approaching daily fat limit — choose lean proteins and avoid fried foods.");
        }
        return warnings;
    }
}
