package com.nutrifridge.core.exception;

public class InventoryInsufficientException extends RuntimeException {
    public InventoryInsufficientException(String itemName, double available, double requested) {
        super("Insufficient inventory for '%s': %.1f available, %.1f requested."
                .formatted(itemName, available, requested));
    }
}
