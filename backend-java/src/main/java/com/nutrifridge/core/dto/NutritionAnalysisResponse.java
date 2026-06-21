package com.nutrifridge.core.dto;

import java.time.LocalDate;
import java.util.List;

public record NutritionAnalysisResponse(
        LocalDate date,
        MacroTotals consumed,
        MacroTotals target,
        MacroTotals remaining,
        MacroStatus macroStatus,
        List<String> healthWarnings,
        String summary,
        String nextMealRecommendation,
        List<String> adjustmentReasons,
        String disclaimer
) {
    public static final String DISCLAIMER =
            "NutriFridge AI provides nutrition estimates for planning purposes only " +
            "and is not medical advice.";
}
