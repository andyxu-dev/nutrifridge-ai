package com.nutrifridge.core.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;

/**
 * Non-blocking WebClient wrapper for calls to the existing FastAPI backend.
 *
 * HTTP/networking design:
 *  - Connect + read timeouts configured in WebClientConfig (fail fast).
 *  - retryWhen(Retry.backoff) retries transient failures (connection reset,
 *    timeout) with exponential back-off; 4xx errors are NOT retried.
 *  - onErrorReturn / onErrorResume provides graceful degradation so the Java
 *    service remains functional when FastAPI is unavailable.
 *  - block() converts Mono → value within service methods; this is acceptable
 *    because callers run on the bounded mealPlanExecutor thread pool, not
 *    on the Netty event loop.
 */
@Component
public class FastApiNutritionClient {

    private static final Logger log = LoggerFactory.getLogger(FastApiNutritionClient.class);

    private final WebClient webClient;
    private final int retryMaxAttempts;
    private final long retryDelayMs;

    public FastApiNutritionClient(WebClient fastApiWebClient,
                                  @Value("${nutrifridge.fastapi.retry-max-attempts:3}") int retryMaxAttempts,
                                  @Value("${nutrifridge.fastapi.retry-delay-ms:500}") long retryDelayMs) {
        this.webClient       = fastApiWebClient;
        this.retryMaxAttempts = retryMaxAttempts;
        this.retryDelayMs    = retryDelayMs;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /** Fetch all inventory items from FastAPI. Returns empty list on failure. */
    public List<InventoryItemSummary> getInventoryItems() {
        return webClient.get()
                .uri("/inventory")
                .retrieve()
                .bodyToFlux(InventoryItemSummary.class)
                .retryWhen(transientRetry())
                .collectList()
                .timeout(Duration.ofSeconds(8))
                .doOnError(ex -> log.warn("FastAPI /inventory unavailable: {}", ex.getMessage()))
                .onErrorReturn(List.of())
                .block();
    }

    /** Search foods by query string. Returns empty list on failure. */
    public List<FoodSearchResult> searchFoods(String query) {
        return webClient.get()
                .uri("/foods/search?q={q}", query)
                .retrieve()
                .bodyToFlux(FoodSearchResult.class)
                .retryWhen(transientRetry())
                .collectList()
                .timeout(Duration.ofSeconds(5))
                .doOnError(ex -> log.warn("FastAPI /foods/search unavailable: {}", ex.getMessage()))
                .onErrorReturn(List.of())
                .block();
    }

    /** Fetch today's nutrition log from FastAPI. Returns null on failure. */
    public NutritionLogSummary getTodayLog() {
        return webClient.get()
                .uri("/nutrition-log/today")
                .retrieve()
                .bodyToMono(NutritionLogSummary.class)
                .retryWhen(transientRetry())
                .timeout(Duration.ofSeconds(5))
                .doOnError(ex -> log.warn("FastAPI /nutrition-log/today unavailable: {}", ex.getMessage()))
                .onErrorResume(ex -> Mono.empty())
                .block();
    }

    /** Fetch the user profile from FastAPI. Returns null on failure. */
    public FastApiProfile getProfile() {
        return webClient.get()
                .uri("/profile")
                .retrieve()
                .bodyToMono(FastApiProfile.class)
                .retryWhen(transientRetry())
                .timeout(Duration.ofSeconds(5))
                .doOnError(ex -> log.warn("FastAPI /profile unavailable: {}", ex.getMessage()))
                .onErrorResume(ex -> Mono.empty())
                .block();
    }

    // ── Retry policy ────────────────────────────────────────────────────────

    /**
     * Retry only transient errors (connection refused, timeouts).
     * 4xx HTTP errors are not retried (the server understood the request).
     */
    private Retry transientRetry() {
        return Retry.backoff(retryMaxAttempts, Duration.ofMillis(retryDelayMs))
                .filter(ex -> ex instanceof WebClientRequestException
                           || ex.getMessage() != null && ex.getMessage().contains("timeout"))
                .onRetryExhaustedThrow((spec, signal) -> signal.failure());
    }

    // ── Response DTOs (Jackson-mapped from FastAPI JSON) ────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record InventoryItemSummary(
            Long id, String name, double quantity, String unit,
            String zone, String category, String bestBeforeDate,
            Double caloriesPer100g, Double proteinPer100g,
            Double carbsPer100g, Double fatPer100g
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FoodSearchResult(
            Long id, String name,
            Double caloriesPer100g, Double proteinPer100g,
            Double carbsPer100g, Double fatPer100g
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record NutritionLogSummary(
            String date,
            ConsumedMacros consumed
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ConsumedMacros(
            double calories, double protein_g, double carbs_g, double fat_g
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FastApiProfile(
            String name, Integer age, String sex,
            Double heightCm, Double weightKg,
            String activityLevel, String goal,
            String macroStrategy,
            List<String> healthConditions,
            List<String> allergies,
            List<String> strictAvoidFoods
    ) {}
}
