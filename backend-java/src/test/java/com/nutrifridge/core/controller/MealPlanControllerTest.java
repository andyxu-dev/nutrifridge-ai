package com.nutrifridge.core.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.exception.GlobalExceptionHandler;
import com.nutrifridge.core.exception.JobNotFoundException;
import com.nutrifridge.core.service.MealPlanService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MealPlanController.class)
@Import(GlobalExceptionHandler.class)
class MealPlanControllerTest {

    @Autowired MockMvc     mockMvc;
    @Autowired ObjectMapper objectMapper;
    @MockBean  MealPlanService mealPlanService;

    @Test
    void postJob_returns202WithJobId() throws Exception {
        when(mealPlanService.submitJob(any())).thenReturn("job-uuid-123");

        mockMvc.perform(post("/api/v1/meal-plans/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validJobRequest()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").value("job-uuid-123"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(header().string("Location",
                        org.hamcrest.Matchers.containsString("job-uuid-123")));
    }

    @Test
    void getJob_returns200WithJobState() throws Exception {
        MealPlanJobResponse response = new MealPlanJobResponse(
                "job-abc", "RUNNING", null, null,
                LocalDateTime.now(), LocalDateTime.now());
        when(mealPlanService.getJob("job-abc")).thenReturn(response);

        mockMvc.perform(get("/api/v1/meal-plans/jobs/job-abc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value("job-abc"))
                .andExpect(jsonPath("$.status").value("RUNNING"));
    }

    @Test
    void getJob_returns404ForUnknownJob() throws Exception {
        when(mealPlanService.getJob("bad-id"))
                .thenThrow(new JobNotFoundException("bad-id"));

        mockMvc.perform(get("/api/v1/meal-plans/jobs/bad-id"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("JOB_NOT_FOUND"));
    }

    @Test
    void postJob_returns400WhenProfileMissing() throws Exception {
        String invalidBody = "{\"baseTarget\":{\"calories\":2000,\"proteinG\":150,\"carbsG\":200,\"fatG\":65}," +
                "\"consumed\":{\"calories\":0,\"proteinG\":0,\"carbsG\":0,\"fatG\":0}}";

        mockMvc.perform(post("/api/v1/meal-plans/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidBody))
                .andExpect(status().isBadRequest());
    }

    private String validJobRequest() throws Exception {
        UserProfileDto profile = new UserProfileDto(
                "Test", 30, "male", 175, 75, "moderate", "maintenance",
                null, List.of("fatty_liver"), List.of(), List.of());
        MacroTotals target   = new MacroTotals(2000, 150, 200, 65);
        MacroTotals consumed = new MacroTotals(800, 60, 100, 25);
        return objectMapper.writeValueAsString(
                new MealPlanJobRequest("default", profile, target, consumed));
    }
}
