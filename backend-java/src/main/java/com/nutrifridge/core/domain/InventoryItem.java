package com.nutrifridge.core.domain;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Represents a physical item in the user's fridge/freezer/pantry.
 *
 * @Version enables optimistic locking: concurrent deductions from the same item
 * cause the second writer to receive ObjectOptimisticLockingFailureException,
 * which the service maps to HTTP 409 Conflict.
 */
@Entity
@Table(name = "inventory_items")
public class InventoryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private double quantity;

    @Column(nullable = false)
    private String unit = "g";

    @Column(nullable = false)
    private String zone = "fridge";

    private String category;
    private LocalDate bestBeforeDate;
    private Double caloriesPer100g;
    private Double proteinPer100g;
    private Double carbsPer100g;
    private Double fatPer100g;

    /** Incremented automatically by JPA on each successful write — drives optimistic locking. */
    @Version
    @Column(nullable = false)
    private long version = 0;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    // ── Behaviour ──────────────────────────────────────────────────────────

    /** Deduct a used amount. Callers must check sufficiency before calling. */
    public void deduct(double amount) {
        this.quantity = Math.max(0.0, this.quantity - amount);
    }

    // ── Getters / setters ──────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getName() { return name; }
    public double getQuantity() { return quantity; }
    public String getUnit() { return unit; }
    public String getZone() { return zone; }
    public String getCategory() { return category; }
    public LocalDate getBestBeforeDate() { return bestBeforeDate; }
    public Double getCaloriesPer100g() { return caloriesPer100g; }
    public Double getProteinPer100g() { return proteinPer100g; }
    public Double getCarbsPer100g() { return carbsPer100g; }
    public Double getFatPer100g() { return fatPer100g; }
    public long getVersion() { return version; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public void setId(Long id) { this.id = id; }
    public void setName(String name) { this.name = name; }
    public void setQuantity(double quantity) { this.quantity = quantity; }
    public void setUnit(String unit) { this.unit = unit; }
    public void setZone(String zone) { this.zone = zone; }
    public void setCategory(String category) { this.category = category; }
    public void setBestBeforeDate(LocalDate bestBeforeDate) { this.bestBeforeDate = bestBeforeDate; }
    public void setCaloriesPer100g(Double v) { this.caloriesPer100g = v; }
    public void setProteinPer100g(Double v) { this.proteinPer100g = v; }
    public void setCarbsPer100g(Double v) { this.carbsPer100g = v; }
    public void setFatPer100g(Double v) { this.fatPer100g = v; }
}
