package com.nutrifridge.core.dto;

import java.time.LocalDateTime;

public record MealPlanJobResponse(
        String jobId,
        String status,
        Object result,
        String errorMessage,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
