package com.nutrifridge.core.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "meal_logs")
public class MealLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "daily_log_id", nullable = false)
    private Long dailyLogId;

    @Column(name = "user_id", nullable = false)
    private String userId = "default";

    @Column(nullable = false)
    private String mealType;

    @Column(nullable = false)
    private String mealName;

    @Column(nullable = false)
    private double calories;

    @Column(nullable = false)
    private double proteinG;

    @Column(nullable = false)
    private double carbsG;

    @Column(nullable = false)
    private double fatG;

    @Column(nullable = false)
    private String source = "manual";

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(nullable = false)
    private LocalDateTime loggedAt = LocalDateTime.now();

    // ── Getters / setters ──────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getDailyLogId() { return dailyLogId; }
    public String getUserId() { return userId; }
    public String getMealType() { return mealType; }
    public String getMealName() { return mealName; }
    public double getCalories() { return calories; }
    public double getProteinG() { return proteinG; }
    public double getCarbsG() { return carbsG; }
    public double getFatG() { return fatG; }
    public String getSource() { return source; }
    public String getNotes() { return notes; }
    public LocalDateTime getLoggedAt() { return loggedAt; }

    public void setDailyLogId(Long dailyLogId) { this.dailyLogId = dailyLogId; }
    public void setUserId(String userId) { this.userId = userId; }
    public void setMealType(String mealType) { this.mealType = mealType; }
    public void setMealName(String mealName) { this.mealName = mealName; }
    public void setCalories(double calories) { this.calories = calories; }
    public void setProteinG(double proteinG) { this.proteinG = proteinG; }
    public void setCarbsG(double carbsG) { this.carbsG = carbsG; }
    public void setFatG(double fatG) { this.fatG = fatG; }
    public void setSource(String source) { this.source = source; }
    public void setNotes(String notes) { this.notes = notes; }
}
