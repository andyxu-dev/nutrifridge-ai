package com.nutrifridge.core.domain;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "daily_nutrition_logs",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "log_date"}))
public class DailyNutritionLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId = "default";

    @Column(name = "log_date", nullable = false)
    private LocalDate logDate;

    @Column(nullable = false)
    private double caloriesConsumed = 0;

    @Column(nullable = false)
    private double proteinGConsumed = 0;

    @Column(nullable = false)
    private double carbsGConsumed = 0;

    @Column(nullable = false)
    private double fatGConsumed = 0;

    @Version
    @Column(nullable = false)
    private long version = 0;

    // ── Behaviour ──────────────────────────────────────────────────────────

    public void addMacros(double calories, double proteinG, double carbsG, double fatG) {
        this.caloriesConsumed  = round(this.caloriesConsumed  + calories);
        this.proteinGConsumed  = round(this.proteinGConsumed  + proteinG);
        this.carbsGConsumed    = round(this.carbsGConsumed    + carbsG);
        this.fatGConsumed      = round(this.fatGConsumed      + fatG);
    }

    public void subtractMacros(double calories, double proteinG, double carbsG, double fatG) {
        this.caloriesConsumed  = round(Math.max(0, this.caloriesConsumed  - calories));
        this.proteinGConsumed  = round(Math.max(0, this.proteinGConsumed  - proteinG));
        this.carbsGConsumed    = round(Math.max(0, this.carbsGConsumed    - carbsG));
        this.fatGConsumed      = round(Math.max(0, this.fatGConsumed      - fatG));
    }

    private static double round(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    // ── Getters / setters ──────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public LocalDate getLogDate() { return logDate; }
    public double getCaloriesConsumed() { return caloriesConsumed; }
    public double getProteinGConsumed() { return proteinGConsumed; }
    public double getCarbsGConsumed() { return carbsGConsumed; }
    public double getFatGConsumed() { return fatGConsumed; }
    public long getVersion() { return version; }

    public void setUserId(String userId) { this.userId = userId; }
    public void setLogDate(LocalDate logDate) { this.logDate = logDate; }
}
