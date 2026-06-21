package com.nutrifridge.core.controller;

import com.nutrifridge.core.dto.MealPlanJobRequest;
import com.nutrifridge.core.dto.MealPlanJobResponse;
import com.nutrifridge.core.service.MealPlanService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

/**
 * Async meal-plan generation via the job-queue pattern.
 *
 * POST /api/v1/meal-plans/jobs
 *   HTTP 202 Accepted — job enqueued; response contains {jobId, status: "PENDING"}.
 *   HTTP 400          — validation error on request body.
 *
 * GET /api/v1/meal-plans/jobs/{jobId}
 *   HTTP 200 — current state: PENDING / RUNNING / SUCCEEDED / FAILED.
 *   HTTP 404 — job not found.
 *
 * Clients should poll GET until status is terminal (SUCCEEDED or FAILED).
 * No WebSocket or SSE needed for this use-case — meal plans complete in <5s.
 */
@RestController
@RequestMapping("/api/v1/meal-plans")
public class MealPlanController {

    private final MealPlanService mealPlanService;

    public MealPlanController(MealPlanService mealPlanService) {
        this.mealPlanService = mealPlanService;
    }

    @PostMapping("/jobs")
    public ResponseEntity<MealPlanJobResponse> submitJob(
            @Valid @RequestBody MealPlanJobRequest request) {
        String jobId = mealPlanService.submitJob(request);
        MealPlanJobResponse response = new MealPlanJobResponse(
                jobId, "PENDING", null, null, null, null);
        return ResponseEntity
                .accepted()
                .location(URI.create("/api/v1/meal-plans/jobs/" + jobId))
                .body(response);
    }

    @GetMapping("/jobs/{jobId}")
    public ResponseEntity<MealPlanJobResponse> getJob(@PathVariable String jobId) {
        return ResponseEntity.ok(mealPlanService.getJob(jobId));
    }
}
