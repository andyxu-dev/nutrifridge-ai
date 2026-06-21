package com.nutrifridge.core.exception;

public class JobNotFoundException extends RuntimeException {
    public JobNotFoundException(String jobId) {
        super("Meal plan job '%s' not found.".formatted(jobId));
    }
}
