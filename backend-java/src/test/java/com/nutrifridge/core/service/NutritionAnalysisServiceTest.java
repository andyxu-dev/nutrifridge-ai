package com.nutrifridge.core.service;

import com.nutrifridge.core.domain.DailyNutritionLog;
import com.nutrifridge.core.dto.*;
import com.nutrifridge.core.repository.DailyNutritionLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NutritionAnalysisServiceTest {

    @Mock DailyNutritionLogRepository dailyLogRepo;
    @Mock NutritionTargetCalculator   targetCalculator;
    @Mock HealthConstraintService     constraintService;

    NutritionAnalysisService service;

    private static final MacroTotals BASE_TARGET = new MacroTotals(2000, 150, 200, 65);

    @BeforeEach
    void setUp() {
        service = new NutritionAnalysisService(dailyLogRepo, targetCalculator, constraintService);
        when(targetCalculator.calculate(any())).thenReturn(BASE_TARGET);
        when(constraintService.adjustTarget(any(), any())).thenAnswer(inv -> inv.getArgument(0));
        when(constraintService.generateWarnings(any(), any(), any())).thenReturn(List.of());
    }

    private UserProfileDto profile(List<String> conditions) {
        return new UserProfileDto("Test", 30, "male", 175, 75,
                "moderate", "maintenance", null, conditions, List.of(), List.of());
    }

    @Test
    void analyzeToday_returnsZeroConsumedWhenNoLogExists() {
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.empty());

        NutritionAnalysisResponse resp = service.analyzeToday("default", profile(List.of()));

        assertThat(resp.consumed().calories()).isZero();
        assertThat(resp.consumed().proteinG()).isZero();
        assertThat(resp.date()).isEqualTo(LocalDate.now());
    }

    @Test
    void analyzeToday_computesRemainingCorrectly() {
        DailyNutritionLog log = logWithMacros(800, 60, 100, 25);
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.of(log));

        NutritionAnalysisResponse resp = service.analyzeToday("default", profile(List.of()));

        assertThat(resp.remaining().calories()).isEqualTo(1200.0);
        assertThat(resp.remaining().proteinG()).isEqualTo(90.0);
    }

    @Test
    void analyzeToday_macroStatusIsOnTrackWhenBetween50And110Pct() {
        DailyNutritionLog log = logWithMacros(1400, 105, 140, 45); // ~70% of target
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.of(log));

        NutritionAnalysisResponse resp = service.analyzeToday("default", profile(List.of()));

        assertThat(resp.macroStatus().calories()).isEqualTo("on_track");
        assertThat(resp.macroStatus().protein()).isEqualTo("on_track");
    }

    @Test
    void analyzeToday_macroStatusIsUnderWhenBelow50Pct() {
        DailyNutritionLog log = logWithMacros(500, 30, 50, 15); // ~25% of target
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.of(log));

        NutritionAnalysisResponse resp = service.analyzeToday("default", profile(List.of()));

        assertThat(resp.macroStatus().calories()).isEqualTo("under");
    }

    @Test
    void analyzeToday_macroStatusIsOverWhenAbove110Pct() {
        DailyNutritionLog log = logWithMacros(2300, 180, 250, 80); // ~115% of target
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.of(log));

        NutritionAnalysisResponse resp = service.analyzeToday("default", profile(List.of()));

        assertThat(resp.macroStatus().calories()).isEqualTo("over");
    }

    @Test
    void analyzeToday_includesHealthWarningsFromConstraintService() {
        DailyNutritionLog log = logWithMacros(1800, 100, 150, 48);
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.of(log));
        when(constraintService.generateWarnings(any(), any(), any()))
                .thenReturn(List.of("Approaching fat limit."));

        NutritionAnalysisResponse resp = service.analyzeToday("default",
                profile(List.of("fatty_liver")));

        assertThat(resp.healthWarnings()).containsExactly("Approaching fat limit.");
    }

    @Test
    void analyzeToday_disclaimerAlwaysPresent() {
        when(dailyLogRepo.findByUserIdAndLogDate(any(), any())).thenReturn(Optional.empty());

        NutritionAnalysisResponse resp = service.analyzeToday("default", profile(List.of()));

        assertThat(resp.disclaimer()).isNotBlank();
        assertThat(resp.disclaimer()).contains("not medical advice");
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private DailyNutritionLog logWithMacros(double cal, double pro, double carb, double fat) {
        DailyNutritionLog log = new DailyNutritionLog();
        log.setLogDate(LocalDate.now());
        log.setUserId("default");
        log.addMacros(cal, pro, carb, fat);
        return log;
    }
}
