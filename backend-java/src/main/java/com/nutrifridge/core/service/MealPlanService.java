package com.nutrifridge.core.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrifridge.core.client.FastApiNutritionClient;
import com.nutrifridge.core.domain.JobStatus;
import com.nutrifridge.core.domain.MealPlanJob;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.exception.JobNotFoundException;
import com.nutrifridge.core.repository.MealPlanJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/**
 * Manages async meal-plan generation jobs.
 *
 * Concurrency design:
 *  - submitJob() saves the job as PENDING, then hands off to a bounded
 *    ThreadPoolTaskExecutor (see AsyncConfig) via CompletableFuture.runAsync().
 *  - The async task runs executeJob() in a separate thread: PENDING → RUNNING
 *    → SUCCEEDED / FAILED.  Status transitions are persisted immediately so
 *    GET /jobs/{id} reflects live progress.
 *  - No shared mutable state: all inter-thread communication goes through the DB.
 *  - The executor is bounded (CallerRunsPolicy) so a flood of requests slows
 *    the caller rather than growing the queue unboundedly.
 */
@Service
public class MealPlanService {

    private static final Logger log = LoggerFactory.getLogger(MealPlanService.class);

    private final MealPlanJobRepository jobRepo;
    private final Executor mealPlanExecutor;
    private final HealthConstraintService constraintService;
    private final NutritionTargetCalculator targetCalculator;
    private final FastApiNutritionClient fastApiClient;
    private final ObjectMapper objectMapper;

    public MealPlanService(MealPlanJobRepository jobRepo,
                           @Qualifier("mealPlanExecutor") Executor mealPlanExecutor,
                           HealthConstraintService constraintService,
                           NutritionTargetCalculator targetCalculator,
                           FastApiNutritionClient fastApiClient,
                           ObjectMapper objectMapper) {
        this.jobRepo            = jobRepo;
        this.mealPlanExecutor   = mealPlanExecutor;
        this.constraintService  = constraintService;
        this.targetCalculator   = targetCalculator;
        this.fastApiClient      = fastApiClient;
        this.objectMapper       = objectMapper;
    }

    /** Accept a job request, persist it as PENDING, return 202 immediately. */
    @Transactional
    public String submitJob(MealPlanJobRequest request) {
        MealPlanJob job = new MealPlanJob();
        job.setUserId(request.resolvedUserId());
        job.setStatus(JobStatus.PENDING);
        job = jobRepo.save(job); // reassign: @PrePersist populates id before persist in prod; save() returns the managed entity

        String jobId = job.getId();
        CompletableFuture.runAsync(() -> executeJob(jobId, request), mealPlanExecutor)
                .exceptionally(ex -> {
                    log.error("Unhandled exception in meal plan job {}", jobId, ex);
                    markFailed(jobId, "Unexpected error: " + ex.getMessage());
                    return null;
                });

        return jobId;
    }

    /** Poll job status and result. */
    public MealPlanJobResponse getJob(String jobId) {
        MealPlanJob job = jobRepo.findById(jobId)
                .orElseThrow(() -> new JobNotFoundException(jobId));
        return toResponse(job);
    }

    // ── Async execution ────────────────────────────────────────────────────

    private void executeJob(String jobId, MealPlanJobRequest request) {
        updateStatus(jobId, JobStatus.RUNNING);
        try {
            MacroTotals adjusted = constraintService.adjustTarget(request.baseTarget(), request.profile());
            Set<String> excluded = constraintService.collectExcludedFragments(request.profile());
            List<String> warnings = constraintService.generateWarnings(request.consumed(), adjusted, request.profile());

            // Try to enrich with live inventory from FastAPI; fall back to empty list
            List<FastApiNutritionClient.InventoryItemSummary> inventory =
                    fastApiClient.getInventoryItems();

            List<MealSuggestion> meals = buildMealSuggestions(inventory, excluded, adjusted, request.consumed());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("adjustedTarget", adjusted);
            result.put("consumed",       request.consumed());
            result.put("remaining",      adjusted.minus(request.consumed()));
            result.put("meals",          meals);
            result.put("warnings",       warnings);
            result.put("summary",        meals.isEmpty()
                    ? "Insufficient safe inventory to generate a meal plan."
                    : "Generated %d meal suggestion(s).".formatted(meals.size()));

            markSucceeded(jobId, objectMapper.writeValueAsString(result));

        } catch (JsonProcessingException ex) {
            markFailed(jobId, "Failed to serialise result: " + ex.getMessage());
        } catch (Exception ex) {
            log.warn("Meal plan job {} failed", jobId, ex);
            markFailed(jobId, ex.getMessage());
        }
    }

    private List<MealSuggestion> buildMealSuggestions(
            List<FastApiNutritionClient.InventoryItemSummary> inventory,
            Set<String> excluded,
            MacroTotals target,
            MacroTotals consumed) {

        List<FastApiNutritionClient.InventoryItemSummary> safe = inventory.stream()
                .filter(item -> excluded.stream()
                        .noneMatch(ex -> item.name().toLowerCase().contains(ex)))
                .toList();

        if (safe.isEmpty()) return List.of();

        // Simple greedy suggestion: pick up to 3 items per meal type based on remaining calories
        List<MealSuggestion> meals = new ArrayList<>();
        double calRemaining = target.calories() - consumed.calories();

        String[] mealTypes = {"breakfast", "lunch", "dinner", "snack"};
        double[] fractions = {0.25, 0.35, 0.30, 0.10};

        for (int i = 0; i < mealTypes.length && !safe.isEmpty(); i++) {
            double calBudget = calRemaining * fractions[i];
            if (calBudget < 50) continue;

            List<String> chosen = safe.stream()
                    .limit(3)
                    .map(FastApiNutritionClient.InventoryItemSummary::name)
                    .toList();

            meals.add(new MealSuggestion(
                    mealTypes[i],
                    "Suggested " + mealTypes[i] + " from inventory",
                    chosen,
                    Math.round(calBudget),
                    "Uses available ingredients within calorie budget."
            ));
        }
        return meals;
    }

    // ── Status transitions (each in its own short transaction) ────────────

    @Transactional
    public void updateStatus(String jobId, JobStatus status) {
        jobRepo.findById(jobId).ifPresent(job -> {
            job.setStatus(status);
            jobRepo.save(job);
        });
    }

    @Transactional
    public void markSucceeded(String jobId, String resultJson) {
        jobRepo.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.SUCCEEDED);
            job.setResultJson(resultJson);
            jobRepo.save(job);
        });
    }

    @Transactional
    public void markFailed(String jobId, String errorMessage) {
        jobRepo.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.FAILED);
            job.setErrorMessage(errorMessage);
            jobRepo.save(job);
        });
    }

    // ── DTO helpers ────────────────────────────────────────────────────────

    private MealPlanJobResponse toResponse(MealPlanJob job) {
        Object result = null;
        if (job.getResultJson() != null) {
            try { result = objectMapper.readValue(job.getResultJson(), Object.class); }
            catch (JsonProcessingException ex) { result = job.getResultJson(); }
        }
        return new MealPlanJobResponse(
                job.getId(), job.getStatus().name(),
                result, job.getErrorMessage(),
                job.getCreatedAt(), job.getUpdatedAt());
    }

    /** Simple inner DTO for a generated meal suggestion (not persisted). */
    public record MealSuggestion(
            String mealType,
            String name,
            List<String> ingredients,
            long estimatedCalories,
            String reason
    ) {}
}
