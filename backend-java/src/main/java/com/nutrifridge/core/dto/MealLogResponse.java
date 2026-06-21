package com.nutrifridge.core.dto;

import java.time.LocalDateTime;

public record MealLogResponse(
        Long id,
        String mealType,
        String mealName,
        double calories,
        double proteinG,
        double carbsG,
        double fatG,
        String source,
        String notes,
        LocalDateTime loggedAt,
        MacroTotals dailyConsumed,
        MacroTotals dailyTarget,
        MacroTotals dailyRemaining,
        MacroStatus macroStatus
) {}
