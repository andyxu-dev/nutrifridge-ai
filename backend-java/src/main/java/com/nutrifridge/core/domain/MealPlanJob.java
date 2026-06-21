package com.nutrifridge.core.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Persisted record of an async meal-plan generation job.
 * Storing status in the DB (rather than in-memory) means job state
 * survives JVM restarts and can be queried across multiple instances.
 */
@Entity
@Table(name = "meal_plan_jobs")
public class MealPlanJob {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId = "default";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private JobStatus status = JobStatus.PENDING;

    @Column(name = "result_json", columnDefinition = "TEXT")
    private String resultJson;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    protected void prePersist() {
        if (id == null) id = UUID.randomUUID().toString();
    }

    @PreUpdate
    protected void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Getters / setters ──────────────────────────────────────────────────

    public String getId() { return id; }
    public String getUserId() { return userId; }
    public JobStatus getStatus() { return status; }
    public String getResultJson() { return resultJson; }
    public String getErrorMessage() { return errorMessage; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    public void setUserId(String userId) { this.userId = userId; }
    public void setStatus(JobStatus status) { this.status = status; }
    public void setResultJson(String resultJson) { this.resultJson = resultJson; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
