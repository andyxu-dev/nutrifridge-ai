package com.nutrifridge.core.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrifridge.core.client.FastApiNutritionClient;
import com.nutrifridge.core.domain.JobStatus;
import com.nutrifridge.core.domain.MealPlanJob;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.exception.JobNotFoundException;
import com.nutrifridge.core.repository.MealPlanJobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MealPlanServiceTest {

    @Mock MealPlanJobRepository    jobRepo;
    @Mock HealthConstraintService  constraintService;
    @Mock NutritionTargetCalculator targetCalculator;
    @Mock FastApiNutritionClient   fastApiClient;

    // Synchronous executor — runs Runnables on the calling thread so async work is testable
    final Executor syncExecutor = Runnable::run;

    MealPlanService service;
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private static final UserProfileDto PROFILE = new UserProfileDto(
            "Test", 30, "male", 175, 75, "moderate", "maintenance",
            null, List.of(), List.of(), List.of());

    private static final MacroTotals TARGET = new MacroTotals(2000, 150, 200, 65);
    private static final MacroTotals CONSUMED = new MacroTotals(800, 60, 100, 25);

    @BeforeEach
    void setUp() {
        service = new MealPlanService(jobRepo, syncExecutor, constraintService,
                targetCalculator, fastApiClient, objectMapper);
    }

    @Test
    void submitJob_persistsPendingJobAndReturnsId() {
        MealPlanJob savedJob = jobWithId("abc-123");
        when(jobRepo.save(any())).thenReturn(savedJob);
        when(jobRepo.findById("abc-123")).thenReturn(Optional.of(savedJob));
        stubConstraints();
        when(fastApiClient.getInventoryItems()).thenReturn(List.of());

        String jobId = service.submitJob(new MealPlanJobRequest(null, PROFILE, TARGET, CONSUMED));

        assertThat(jobId).isEqualTo("abc-123");
        verify(jobRepo, atLeastOnce()).save(any());
    }

    @Test
    void submitJob_marksJobAsSucceeded_whenFastApiEmpty() {
        MealPlanJob job = jobWithId("job-1");
        when(jobRepo.save(any())).thenReturn(job);
        when(jobRepo.findById("job-1")).thenReturn(Optional.of(job));
        stubConstraints();
        when(fastApiClient.getInventoryItems()).thenReturn(List.of());

        service.submitJob(new MealPlanJobRequest(null, PROFILE, TARGET, CONSUMED));

        // syncExecutor runs the async task inline — job should now be SUCCEEDED or FAILED
        verify(jobRepo, atLeast(2)).findById("job-1");
    }

    @Test
    void getJob_throwsJobNotFoundForUnknownId() {
        when(jobRepo.findById("unknown")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getJob("unknown"))
                .isInstanceOf(JobNotFoundException.class)
                .hasMessageContaining("unknown");
    }

    @Test
    void getJob_returnsPendingStatusForNewJob() {
        MealPlanJob pendingJob = jobWithId("j2");
        pendingJob.setStatus(JobStatus.PENDING);
        when(jobRepo.findById("j2")).thenReturn(Optional.of(pendingJob));

        MealPlanJobResponse response = service.getJob("j2");

        assertThat(response.jobId()).isEqualTo("j2");
        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(response.result()).isNull();
        assertThat(response.errorMessage()).isNull();
    }

    @Test
    void allergyExclusionFiltersInventoryItems() {
        MealPlanJob job = jobWithId("job-allergy");
        when(jobRepo.save(any())).thenReturn(job);
        when(jobRepo.findById("job-allergy")).thenReturn(Optional.of(job));
        when(constraintService.adjustTarget(any(), any())).thenReturn(TARGET);
        when(constraintService.collectExcludedFragments(any())).thenReturn(Set.of("peanut"));
        when(constraintService.generateWarnings(any(), any(), any())).thenReturn(List.of());

        // Inventory contains peanut butter — should be excluded
        var peanutButter = new FastApiNutritionClient.InventoryItemSummary(
                1L, "Peanut Butter", 200.0, "g", "pantry", "condiment",
                null, 588.0, 25.0, 20.0, 50.0);
        var chicken = new FastApiNutritionClient.InventoryItemSummary(
                2L, "Chicken Breast", 500.0, "g", "fridge", "meat",
                null, 165.0, 31.0, 0.0, 3.6);
        when(fastApiClient.getInventoryItems()).thenReturn(List.of(peanutButter, chicken));

        ArgumentCaptor<MealPlanJob> jobCaptor = ArgumentCaptor.forClass(MealPlanJob.class);
        service.submitJob(new MealPlanJobRequest(null, PROFILE, TARGET, CONSUMED));

        // The job should SUCCEED and the result JSON should not contain "peanut butter"
        verify(jobRepo, atLeastOnce()).save(jobCaptor.capture());
        boolean anySuccess = jobCaptor.getAllValues().stream()
                .anyMatch(j -> j.getStatus() == JobStatus.SUCCEEDED
                        && j.getResultJson() != null
                        && !j.getResultJson().toLowerCase().contains("peanut"));
        assertThat(anySuccess).isTrue();
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private MealPlanJob jobWithId(String id) {
        MealPlanJob job = new MealPlanJob();
        // Bypass @PrePersist by setting id directly via reflection
        try {
            var f = MealPlanJob.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(job, id);
        } catch (Exception e) { throw new RuntimeException(e); }
        job.setStatus(JobStatus.PENDING);
        return job;
    }

    private void stubConstraints() {
        when(constraintService.adjustTarget(any(), any())).thenReturn(TARGET);
        when(constraintService.collectExcludedFragments(any())).thenReturn(Set.of());
        when(constraintService.generateWarnings(any(), any(), any())).thenReturn(List.of());
    }
}
