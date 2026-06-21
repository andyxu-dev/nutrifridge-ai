package com.nutrifridge.core.service;

import com.nutrifridge.core.domain.DailyNutritionLog;
import com.nutrifridge.core.domain.InventoryItem;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.exception.InventoryConflictException;
import com.nutrifridge.core.exception.InventoryInsufficientException;
import com.nutrifridge.core.repository.DailyNutritionLogRepository;
import com.nutrifridge.core.repository.InventoryItemRepository;
import com.nutrifridge.core.repository.MealLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MealLogServiceTest {

    @Mock MealLogRepository            mealLogRepo;
    @Mock DailyNutritionLogRepository  dailyLogRepo;
    @Mock InventoryItemRepository      inventoryRepo;
    @Mock NutritionTargetCalculator    targetCalculator;
    @Mock HealthConstraintService      constraintService;

    MealLogService service;

    private static final UserProfileDto PROFILE = new UserProfileDto(
            "Test", 30, "male", 175, 75, "moderate", "maintenance",
            null, List.of(), List.of(), List.of());

    private static final MacroTotals BASE_TARGET = new MacroTotals(2000, 150, 200, 65);

    @BeforeEach
    void setUp() {
        service = new MealLogService(mealLogRepo, dailyLogRepo, inventoryRepo,
                targetCalculator, constraintService);

        // Default stubs — lenient on target/constraint because tests that throw before the
        // response-building step never reach these calls.
        lenient().when(targetCalculator.calculate(any())).thenReturn(BASE_TARGET);
        lenient().when(constraintService.adjustTarget(any(), any())).thenAnswer(inv -> inv.getArgument(0));
        when(mealLogRepo.save(any())).thenAnswer(inv -> {
            var m = inv.getArgument(0, com.nutrifridge.core.domain.MealLog.class);
            return m;
        });
    }

    @Test
    void logMeal_createsDailyLogWhenNoneExists() {
        DailyNutritionLog newLog = dailyLog(0, 0, 0, 0);
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.empty());
        when(dailyLogRepo.save(any())).thenReturn(newLog);

        MealLogRequest request = mealRequest(400, 30, 40, 10, List.of());
        service.logMeal(request, PROFILE);

        verify(dailyLogRepo, times(2)).save(any()); // once for create, once for macro update
    }

    @Test
    void logMeal_updatesExistingDailyLog() {
        DailyNutritionLog existing = dailyLog(800, 60, 100, 25);
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.of(existing));
        when(dailyLogRepo.save(any())).thenReturn(existing);

        MealLogRequest request = mealRequest(400, 30, 40, 10, List.of());
        MealLogResponse response = service.logMeal(request, PROFILE);

        assertThat(response.dailyConsumed().calories()).isEqualTo(1200.0);
        assertThat(response.dailyConsumed().proteinG()).isEqualTo(90.0);
    }

    @Test
    void logMeal_deductsInventoryByRequestedQuantity() {
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any()))
                .thenReturn(Optional.of(dailyLog(0, 0, 0, 0)));
        when(dailyLogRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        InventoryItem item = inventoryItem(1L, 500.0);
        when(inventoryRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(item));
        when(inventoryRepo.saveAndFlush(any())).thenReturn(item);

        MealLogRequest request = mealRequest(300, 25, 30, 8,
                List.of(new IngredientUsage(1L, "Chicken", 150.0, "g")));
        service.logMeal(request, PROFILE);

        assertThat(item.getQuantity()).isEqualTo(350.0); // 500 - 150
    }

    @Test
    void logMeal_throwsConflictOnOptimisticLock() {
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any()))
                .thenReturn(Optional.of(dailyLog(0, 0, 0, 0)));

        InventoryItem item = inventoryItem(1L, 500.0);
        when(inventoryRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(item));
        when(inventoryRepo.saveAndFlush(any()))
                .thenThrow(new ObjectOptimisticLockingFailureException(InventoryItem.class, 1L));

        MealLogRequest request = mealRequest(300, 25, 30, 8,
                List.of(new IngredientUsage(1L, "Chicken", 150.0, "g")));

        assertThatThrownBy(() -> service.logMeal(request, PROFILE))
                .isInstanceOf(InventoryConflictException.class);
    }

    @Test
    void logMeal_throwsWhenInsufficientInventory() {
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any()))
                .thenReturn(Optional.of(dailyLog(0, 0, 0, 0)));

        InventoryItem item = inventoryItem(1L, 50.0); // only 50g available
        when(inventoryRepo.findByIdForUpdate(1L)).thenReturn(Optional.of(item));

        MealLogRequest request = mealRequest(300, 25, 30, 8,
                List.of(new IngredientUsage(1L, "Chicken", 150.0, "g"))); // needs 150g

        assertThatThrownBy(() -> service.logMeal(request, PROFILE))
                .isInstanceOf(InventoryInsufficientException.class)
                .hasMessageContaining("Insufficient inventory");
    }

    @Test
    void logMeal_skipsDeductionForNullInventoryItemId() {
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any()))
                .thenReturn(Optional.of(dailyLog(0, 0, 0, 0)));
        when(dailyLogRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // inventoryItemId is null → manual meal, no deduction expected
        MealLogRequest request = mealRequest(220, 20, 25, 6,
                List.of(new IngredientUsage(null, "Restaurant meal", 1.0, "serving")));
        service.logMeal(request, PROFILE);

        verify(inventoryRepo, never()).findByIdForUpdate(any());
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private DailyNutritionLog dailyLog(double cal, double pro, double carb, double fat) {
        DailyNutritionLog log = new DailyNutritionLog();
        log.setLogDate(LocalDate.now());
        log.setUserId("default");
        log.addMacros(cal, pro, carb, fat);
        return log;
    }

    private InventoryItem inventoryItem(Long id, double qty) {
        InventoryItem item = new InventoryItem();
        item.setId(id);
        item.setName("Test Item");
        item.setQuantity(qty);
        item.setUnit("g");
        return item;
    }

    private MealLogRequest mealRequest(double cal, double pro, double carb, double fat,
                                       List<IngredientUsage> ingredients) {
        return new MealLogRequest("default", "lunch", "Test Meal",
                cal, pro, carb, fat, ingredients, null);
    }
}
