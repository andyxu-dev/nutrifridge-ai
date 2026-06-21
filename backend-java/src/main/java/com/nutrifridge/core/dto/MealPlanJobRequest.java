package com.nutrifridge.core.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record MealPlanJobRequest(
        String userId,
        @Valid @NotNull UserProfileDto profile,
        @Valid @NotNull MacroTotals baseTarget,
        @Valid @NotNull MacroTotals consumed
) {
    public String resolvedUserId() {
        return (userId == null || userId.isBlank()) ? "default" : userId;
    }
}
