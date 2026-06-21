package com.nutrifridge.core.exception;

public class InventoryConflictException extends RuntimeException {
    public InventoryConflictException(String itemName) {
        super("Inventory item '%s' was concurrently modified. Please retry.".formatted(itemName));
    }
}
