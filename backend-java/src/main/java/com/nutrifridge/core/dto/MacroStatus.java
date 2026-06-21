package com.nutrifridge.core.dto;

/**
 * Per-macro tracking status: under / on_track / over.
 * Thresholds: <50% = under, 50–110% = on_track, >110% = over.
 */
public record MacroStatus(
        String calories,
        String protein,
        String carbs,
        String fat
) {
    public static MacroStatus of(MacroTotals consumed, MacroTotals target) {
        return new MacroStatus(
                classify(consumed.calories(), target.calories()),
                classify(consumed.proteinG(),  target.proteinG()),
                classify(consumed.carbsG(),    target.carbsG()),
                classify(consumed.fatG(),      target.fatG())
        );
    }

    private static String classify(double consumed, double target) {
        if (target <= 0) return "on_track";
        double ratio = consumed / target;
        if (ratio < 0.50) return "under";
        if (ratio <= 1.10) return "on_track";
        return "over";
    }
}
