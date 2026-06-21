package com.nutrifridge.core.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.util.List;

public record UserProfileDto(
        @NotBlank String name,
        @Min(1) @Max(120) int ageYears,
        @NotBlank String sex,
        @Positive double heightCm,
        @Positive double weightKg,
        @NotBlank String activityLevel,
        @NotBlank String goal,
        String macroStrategy,
        List<String> healthConditions,
        List<String> allergies,
        List<String> strictAvoidFoods
) {
    public List<String> safeConditions() {
        return healthConditions == null ? List.of() : healthConditions;
    }

    public List<String> safeAllergies() {
        return allergies == null ? List.of() : allergies;
    }

    public List<String> safeStrictAvoid() {
        return strictAvoidFoods == null ? List.of() : strictAvoidFoods;
    }
}
