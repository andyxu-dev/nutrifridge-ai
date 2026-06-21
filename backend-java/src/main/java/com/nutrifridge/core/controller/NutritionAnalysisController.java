package com.nutrifridge.core.controller;

import com.nutrifridge.core.dto.NutritionAnalysisResponse;
import com.nutrifridge.core.dto.UserProfileDto;
import com.nutrifridge.core.service.NutritionAnalysisService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * GET /api/v1/nutrition/analysis/today
 *
 * Returns today's consumed macros, health-constraint-adjusted targets, macro status,
 * health warnings, and a next-meal recommendation.
 *
 * Profile information is supplied as query parameters so:
 *  1. The endpoint is callable with a single curl command (no auth required in demo).
 *  2. The frontend can call it by reading its own profile state and forwarding fields.
 *  3. The Java service remains stateless with respect to profile storage.
 *
 * Logging data comes from the Java service's own DB (DailyNutritionLog).
 * The FastAPI backend is not required for this endpoint to function.
 *
 * HTTP 200 — analysis returned (consumed may be all-zeros on first call).
 *
 * Example:
 *   GET /api/v1/nutrition/analysis/today
 *     ?ageYears=30&sex=male&weightKg=75&heightCm=175
 *     &activityLevel=moderate&goal=maintenance
 *     &healthConditions=fatty_liver&healthConditions=diabetes
 */
@RestController
@RequestMapping("/api/v1/nutrition")
public class NutritionAnalysisController {

    private final NutritionAnalysisService analysisService;

    public NutritionAnalysisController(NutritionAnalysisService analysisService) {
        this.analysisService = analysisService;
    }

    @GetMapping("/analysis/today")
    public ResponseEntity<NutritionAnalysisResponse> analyzeToday(
            @RequestParam(defaultValue = "default") String userId,
            @RequestParam(defaultValue = "30")  int ageYears,
            @RequestParam(defaultValue = "male") String sex,
            @RequestParam(defaultValue = "70.0") double weightKg,
            @RequestParam(defaultValue = "170.0") double heightCm,
            @RequestParam(defaultValue = "moderate") String activityLevel,
            @RequestParam(defaultValue = "maintenance") String goal,
            @RequestParam(required = false) String macroStrategy,
            @RequestParam(required = false) List<String> healthConditions,
            @RequestParam(required = false) List<String> allergies,
            @RequestParam(required = false) List<String> strictAvoidFoods
    ) {
        UserProfileDto profile = new UserProfileDto(
                userId, ageYears, sex, heightCm, weightKg,
                activityLevel, goal, macroStrategy,
                healthConditions, allergies, strictAvoidFoods
        );
        NutritionAnalysisResponse response = analysisService.analyzeToday(userId, profile);
        return ResponseEntity.ok(response);
    }
}
