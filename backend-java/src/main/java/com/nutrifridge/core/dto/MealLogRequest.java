package com.nutrifridge.core.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

import java.util.List;

public record MealLogRequest(
        String userId,
        @NotBlank String mealType,
        @NotBlank String mealName,
        @PositiveOrZero double calories,
        @PositiveOrZero double proteinG,
        @PositiveOrZero double carbsG,
        @PositiveOrZero double fatG,
        @Valid List<IngredientUsage> ingredientsUsed,
        String notes
) {
    public String resolvedUserId() {
        return (userId == null || userId.isBlank()) ? "default" : userId;
    }
}
