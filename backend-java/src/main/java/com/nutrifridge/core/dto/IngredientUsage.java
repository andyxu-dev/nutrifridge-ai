package com.nutrifridge.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record IngredientUsage(
        Long inventoryItemId,
        @NotBlank String name,
        @Positive double quantityUsed,
        @NotBlank String unit
) {}
