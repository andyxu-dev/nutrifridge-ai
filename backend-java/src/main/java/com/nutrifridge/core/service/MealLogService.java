package com.nutrifridge.core.service;

import com.nutrifridge.core.domain.DailyNutritionLog;
import com.nutrifridge.core.domain.InventoryItem;
import com.nutrifridge.core.domain.MealLog;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.exception.InventoryConflictException;
import com.nutrifridge.core.exception.InventoryInsufficientException;
import com.nutrifridge.core.repository.DailyNutritionLogRepository;
import com.nutrifridge.core.repository.InventoryItemRepository;
import com.nutrifridge.core.repository.MealLogRepository;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Atomically logs a meal, updates the daily nutrition totals, and deducts
 * inventory quantities — all within a single database transaction.
 *
 * Concurrency design:
 *  - findByIdForUpdate() acquires a PESSIMISTIC_WRITE row lock so only one
 *    concurrent request can deduct from the same inventory item at a time.
 *  - @Version on InventoryItem provides a second layer of defence (optimistic
 *    lock) to catch any race that slips past the pessimistic lock (e.g. direct
 *    DB writes, read-only replicas).
 *  - ObjectOptimisticLockingFailureException → HTTP 409 (client retries).
 */
@Service
public class MealLogService {

    private final MealLogRepository mealLogRepo;
    private final DailyNutritionLogRepository dailyLogRepo;
    private final InventoryItemRepository inventoryRepo;
    private final NutritionTargetCalculator targetCalculator;
    private final HealthConstraintService constraintService;

    public MealLogService(MealLogRepository mealLogRepo,
                          DailyNutritionLogRepository dailyLogRepo,
                          InventoryItemRepository inventoryRepo,
                          NutritionTargetCalculator targetCalculator,
                          HealthConstraintService constraintService) {
        this.mealLogRepo       = mealLogRepo;
        this.dailyLogRepo      = dailyLogRepo;
        this.inventoryRepo     = inventoryRepo;
        this.targetCalculator  = targetCalculator;
        this.constraintService = constraintService;
    }

    @Transactional
    public MealLogResponse logMeal(MealLogRequest request, UserProfileDto profile) {
        String userId = request.resolvedUserId();

        // 1. Get or create today's daily log (one row per user per day)
        DailyNutritionLog dailyLog = dailyLogRepo
                .findByUserIdAndLogDate(userId, LocalDate.now())
                .orElseGet(() -> createDailyLog(userId));

        // 2. Create the MealLog record
        MealLog meal = buildMealLog(request, dailyLog.getId(), userId);
        mealLogRepo.save(meal);

        // 3. Update daily macro totals
        dailyLog.addMacros(request.calories(), request.proteinG(), request.carbsG(), request.fatG());
        dailyLogRepo.save(dailyLog);

        // 4. Deduct inventory quantities (with locking)
        deductInventory(request.ingredientsUsed());

        // 5. Build response
        MacroTotals consumed = snapshotConsumed(dailyLog);
        MacroTotals target   = constraintService.adjustTarget(targetCalculator.calculate(profile), profile);
        MacroTotals remaining = target.minus(consumed);
        MacroStatus status   = MacroStatus.of(consumed, target);

        return new MealLogResponse(
                meal.getId(), meal.getMealType(), meal.getMealName(),
                meal.getCalories(), meal.getProteinG(), meal.getCarbsG(), meal.getFatG(),
                meal.getSource(), meal.getNotes(), meal.getLoggedAt(),
                consumed, target, remaining, status
        );
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private DailyNutritionLog createDailyLog(String userId) {
        DailyNutritionLog log = new DailyNutritionLog();
        log.setUserId(userId);
        log.setLogDate(LocalDate.now());
        return dailyLogRepo.save(log);
    }

    private MealLog buildMealLog(MealLogRequest req, Long dailyLogId, String userId) {
        MealLog meal = new MealLog();
        meal.setDailyLogId(dailyLogId);
        meal.setUserId(userId);
        meal.setMealType(req.mealType());
        meal.setMealName(req.mealName());
        meal.setCalories(req.calories());
        meal.setProteinG(req.proteinG());
        meal.setCarbsG(req.carbsG());
        meal.setFatG(req.fatG());
        meal.setSource("manual");
        meal.setNotes(req.notes());
        return meal;
    }

    private void deductInventory(List<IngredientUsage> usages) {
        if (usages == null) return;
        for (IngredientUsage usage : usages) {
            if (usage.inventoryItemId() == null) continue;
            try {
                // Acquire pessimistic write lock before checking/deducting
                InventoryItem item = inventoryRepo
                        .findByIdForUpdate(usage.inventoryItemId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Inventory item %d not found".formatted(usage.inventoryItemId())));

                if (item.getQuantity() < usage.quantityUsed()) {
                    throw new InventoryInsufficientException(
                            item.getName(), item.getQuantity(), usage.quantityUsed());
                }

                item.deduct(usage.quantityUsed());
                inventoryRepo.saveAndFlush(item); // flush forces version check immediately

            } catch (ObjectOptimisticLockingFailureException ex) {
                // A concurrent writer incremented @Version between our read and write
                throw new InventoryConflictException(
                        "item id=" + usage.inventoryItemId());
            }
        }
    }

    private MacroTotals snapshotConsumed(DailyNutritionLog log) {
        return new MacroTotals(
                log.getCaloriesConsumed(),
                log.getProteinGConsumed(),
                log.getCarbsGConsumed(),
                log.getFatGConsumed()
        );
    }
}
