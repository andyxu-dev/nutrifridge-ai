package com.nutrifridge.core.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Centralised HTTP error mapping.
 *
 * HTTP status decisions:
 *   409 Conflict      — optimistic-lock race or insufficient inventory (client should retry)
 *   404 Not Found     — job or resource does not exist
 *   400 Bad Request   — Bean Validation failures
 *   503 Unavailable   — upstream FastAPI is unreachable
 *   500 Internal      — unexpected errors (logged with full stack)
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    record ErrorResponse(String error, String message, String timestamp) {}

    private ResponseEntity<ErrorResponse> respond(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status)
                .body(new ErrorResponse(code, message, LocalDateTime.now().toString()));
    }

    @ExceptionHandler(InventoryConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(InventoryConflictException ex) {
        return respond(HttpStatus.CONFLICT, "INVENTORY_CONFLICT", ex.getMessage());
    }

    @ExceptionHandler(InventoryInsufficientException.class)
    public ResponseEntity<ErrorResponse> handleInsufficient(InventoryInsufficientException ex) {
        return respond(HttpStatus.CONFLICT, "INVENTORY_INSUFFICIENT", ex.getMessage());
    }

    @ExceptionHandler(JobNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleJobNotFound(JobNotFoundException ex) {
        return respond(HttpStatus.NOT_FOUND, "JOB_NOT_FOUND", ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        fe -> fe.getDefaultMessage() == null ? "invalid" : fe.getDefaultMessage(),
                        (a, b) -> a
                ));
        return ResponseEntity.badRequest().body(Map.of(
                "error", "VALIDATION_FAILED",
                "fields", fieldErrors,
                "timestamp", LocalDateTime.now().toString()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "An unexpected error occurred.");
    }
}
