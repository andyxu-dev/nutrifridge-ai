package com.nutrifridge.core.dto;

import jakarta.validation.constraints.PositiveOrZero;

/**
 * Immutable macro snapshot (calories + three macronutrients).
 * Used for targets, consumed totals, and remaining gaps.
 */
public record MacroTotals(
        @PositiveOrZero double calories,
        @PositiveOrZero double proteinG,
        @PositiveOrZero double carbsG,
        @PositiveOrZero double fatG
) {
    public static MacroTotals zero() {
        return new MacroTotals(0, 0, 0, 0);
    }

    public MacroTotals plus(MacroTotals other) {
        return new MacroTotals(
                this.calories + other.calories,
                this.proteinG + other.proteinG,
                this.carbsG   + other.carbsG,
                this.fatG     + other.fatG
        );
    }

    public MacroTotals minus(MacroTotals other) {
        return new MacroTotals(
                Math.max(0, this.calories - other.calories),
                Math.max(0, this.proteinG - other.proteinG),
                Math.max(0, this.carbsG   - other.carbsG),
                Math.max(0, this.fatG     - other.fatG)
        );
    }

    public MacroTotals rounded() {
        return new MacroTotals(
                Math.round(calories * 10.0) / 10.0,
                Math.round(proteinG * 10.0) / 10.0,
                Math.round(carbsG   * 10.0) / 10.0,
                Math.round(fatG     * 10.0) / 10.0
        );
    }
}
