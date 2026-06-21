package com.nutrifridge.core.service;

import com.nutrifridge.core.domain.DailyNutritionLog;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.repository.DailyNutritionLogRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class NutritionAnalysisService {

    private final DailyNutritionLogRepository dailyLogRepo;
    private final NutritionTargetCalculator targetCalculator;
    private final HealthConstraintService constraintService;

    public NutritionAnalysisService(DailyNutritionLogRepository dailyLogRepo,
                                    NutritionTargetCalculator targetCalculator,
                                    HealthConstraintService constraintService) {
        this.dailyLogRepo      = dailyLogRepo;
        this.targetCalculator  = targetCalculator;
        this.constraintService = constraintService;
    }

    public NutritionAnalysisResponse analyzeToday(String userId, UserProfileDto profile) {
        Optional<DailyNutritionLog> logOpt =
                dailyLogRepo.findByUserIdAndLogDate(userId, LocalDate.now());

        MacroTotals consumed = logOpt.map(this::toMacros).orElse(MacroTotals.zero());
        MacroTotals base     = targetCalculator.calculate(profile);
        MacroTotals target   = constraintService.adjustTarget(base, profile);
        MacroTotals remaining = target.minus(consumed);
        MacroStatus status   = MacroStatus.of(consumed, target);

        List<String> warnings    = constraintService.generateWarnings(consumed, target, profile);
        List<String> adjustments = buildAdjustmentReasons(base, target, profile);
        String summary           = buildSummary(status);
        String recommendation    = buildNextMealRec(status, remaining, profile);

        return new NutritionAnalysisResponse(
                LocalDate.now(),
                consumed.rounded(),
                target.rounded(),
                remaining.rounded(),
                status,
                warnings,
                summary,
                recommendation,
                adjustments,
                NutritionAnalysisResponse.DISCLAIMER
        );
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private MacroTotals toMacros(DailyNutritionLog log) {
        return new MacroTotals(
                log.getCaloriesConsumed(), log.getProteinGConsumed(),
                log.getCarbsGConsumed(),   log.getFatGConsumed());
    }

    private List<String> buildAdjustmentReasons(MacroTotals base, MacroTotals adjusted,
                                                 UserProfileDto profile) {
        List<String> reasons = new ArrayList<>();
        if (adjusted.fatG() < base.fatG()) {
            reasons.add("Fat target reduced due to health condition (fatty liver / cholesterol).");
        }
        if (adjusted.carbsG() < base.carbsG()) {
            reasons.add("Carbohydrate target reduced due to diabetes / prediabetes.");
        }
        if (!profile.safeConditions().isEmpty()) {
            reasons.add("Health conditions applied: " + String.join(", ", profile.safeConditions()));
        }
        return reasons;
    }

    private String buildSummary(MacroStatus status) {
        List<String> issues = new ArrayList<>();
        if ("over".equals(status.calories()))   issues.add("calorie target exceeded");
        else if ("under".equals(status.calories())) issues.add("more calories available");
        if ("under".equals(status.protein()))   issues.add("protein is low");
        else if ("over".equals(status.protein())) issues.add("protein is above target");
        if ("over".equals(status.carbs()))      issues.add("carbs are high");
        if ("over".equals(status.fat()))        issues.add("fat is high");

        if (issues.isEmpty()) return "You are on track with all nutrition targets — great work!";
        return "Today's snapshot: " + String.join(", ", issues) + ".";
    }

    private String buildNextMealRec(MacroStatus status, MacroTotals remaining,
                                    UserProfileDto profile) {
        if ("over".equals(status.calories())) {
            return "You have reached your calorie target. Consider a protein-only snack if still hungry.";
        }
        List<String> parts = new ArrayList<>();
        if ("under".equals(status.protein())) parts.add("lean high-protein foods (chicken, eggs, fish)");
        if ("over".equals(status.fat()))      parts.add("avoid added oils and high-fat snacks");
        if ("over".equals(status.carbs()))    parts.add("choose protein and vegetables over starchy carbs");

        for (String cond : profile.safeConditions()) {
            if ("fatty_liver".equals(cond))   parts.add("opt for steamed or grilled over fried");
            if ("diabetes".equals(cond))      parts.add("pair any carbs with protein and fat");
            if ("high_cholesterol".equals(cond)) parts.add("choose lean protein, limit saturated fat");
        }

        if (parts.isEmpty()) return "Continue with your planned meals — you are on track for today.";
        return "For your next meal, consider: " + String.join("; ", parts) + ".";
    }
}
