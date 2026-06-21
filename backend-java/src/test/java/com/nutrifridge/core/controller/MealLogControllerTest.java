package com.nutrifridge.core.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.exception.GlobalExceptionHandler;
import com.nutrifridge.core.exception.InventoryConflictException;
import com.nutrifridge.core.exception.InventoryInsufficientException;
import com.nutrifridge.core.service.MealLogService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MealLogController.class)
@Import(GlobalExceptionHandler.class)
class MealLogControllerTest {

    @Autowired MockMvc    mockMvc;
    @Autowired ObjectMapper objectMapper;
    @MockBean  MealLogService mealLogService;

    private static final MacroTotals TARGET   = new MacroTotals(2000, 150, 200, 65);
    private static final MacroTotals CONSUMED = new MacroTotals(1200, 90, 140, 40);
    private static final MacroTotals REMAINING = TARGET.minus(CONSUMED);
    private static final MacroStatus STATUS = MacroStatus.of(CONSUMED, TARGET);

    @Test
    void postMeal_returns200OnSuccess() throws Exception {
        MealLogResponse response = new MealLogResponse(
                1L, "lunch", "Test Meal", 400, 30, 40, 10,
                "manual", null, LocalDateTime.now(),
                CONSUMED, TARGET, REMAINING, STATUS);
        when(mealLogService.logMeal(any(), any())).thenReturn(response);

        mockMvc.perform(post("/api/v1/meals/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.mealName").value("Test Meal"))
                .andExpect(jsonPath("$.dailyConsumed.calories").value(1200.0));
    }

    @Test
    void postMeal_returns409OnInventoryConflict() throws Exception {
        when(mealLogService.logMeal(any(), any()))
                .thenThrow(new InventoryConflictException("Chicken Breast"));

        mockMvc.perform(post("/api/v1/meals/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("INVENTORY_CONFLICT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Chicken Breast")));
    }

    @Test
    void postMeal_returns409OnInsufficientInventory() throws Exception {
        when(mealLogService.logMeal(any(), any()))
                .thenThrow(new InventoryInsufficientException("Eggs", 2.0, 5.0));

        mockMvc.perform(post("/api/v1/meals/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestJson()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("INVENTORY_INSUFFICIENT"));
    }

    @Test
    void postMeal_returns400WhenMealNameMissing() throws Exception {
        String badRequest = objectMapper.writeValueAsString(new MealLogRequest(
                null, "lunch", "", 400, 30, 40, 10, List.of(), null));

        mockMvc.perform(post("/api/v1/meals/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(badRequest))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fields.mealName").exists());
    }

    @Test
    void postMeal_returns400WhenNegativeCalories() throws Exception {
        String badRequest = objectMapper.writeValueAsString(new MealLogRequest(
                null, "lunch", "Meal", -100, 30, 40, 10, List.of(), null));

        mockMvc.perform(post("/api/v1/meals/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(badRequest))
                .andExpect(status().isBadRequest());
    }

    private String validRequestJson() throws Exception {
        return objectMapper.writeValueAsString(new MealLogRequest(
                "default", "lunch", "Test Meal",
                400.0, 30.0, 40.0, 10.0, List.of(), "test note"));
    }
}
