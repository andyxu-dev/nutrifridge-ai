package com.nutrifridge.core.controller;

import com.nutrifridge.core.dto.MealLogRequest;
import com.nutrifridge.core.dto.MealLogResponse;
import com.nutrifridge.core.dto.UserProfileDto;
import com.nutrifridge.core.service.MealLogService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * POST /api/v1/meals/log
 *
 * Logs a meal atomically: creates MealLog, updates DailyNutritionLog totals,
 * and deducts inventory quantities — all within one @Transactional boundary.
 *
 * HTTP 200 OK      — meal logged successfully; response includes updated daily totals.
 * HTTP 400         — Bean Validation failure (missing required fields, negative macros).
 * HTTP 409 Conflict — inventory concurrently modified (retry) or insufficient stock.
 */
@RestController
@RequestMapping("/api/v1/meals")
public class MealLogController {

    private final MealLogService mealLogService;

    public MealLogController(MealLogService mealLogService) {
        this.mealLogService = mealLogService;
    }

    @PostMapping("/log")
    public ResponseEntity<MealLogResponse> logMeal(
            @Valid @RequestBody MealLogRequest request,
            @RequestParam(required = false) String ageYears,
            @RequestParam(required = false) String sex,
            @RequestParam(required = false) String weightKg,
            @RequestParam(required = false) String heightCm,
            @RequestParam(required = false) String activityLevel,
            @RequestParam(required = false) String goal
    ) {
        // Build a minimal profile from query params; defaults are used when not supplied
        UserProfileDto profile = buildProfile(ageYears, sex, weightKg, heightCm, activityLevel, goal);
        MealLogResponse response = mealLogService.logMeal(request, profile);
        return ResponseEntity.ok(response);
    }

    private UserProfileDto buildProfile(String age, String sex, String weight,
                                        String height, String activity, String goal) {
        return new UserProfileDto(
                "user",
                age      != null ? Integer.parseInt(age)       : 30,
                sex      != null ? sex                          : "male",
                height   != null ? Double.parseDouble(height)   : 170.0,
                weight   != null ? Double.parseDouble(weight)   : 70.0,
                activity != null ? activity                     : "moderate",
                goal     != null ? goal                         : "maintenance",
                null, null, null, null
        );
    }
}
