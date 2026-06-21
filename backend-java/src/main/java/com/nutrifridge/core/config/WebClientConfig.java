package com.nutrifridge.core.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFilterFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * WebClient configured with:
 *  - TCP connect timeout (fail fast if server is unreachable)
 *  - Read/write timeouts via Netty handlers
 *  - Response timeout on individual requests
 *  - 4xx/5xx → runtime exceptions (caller decides retry vs. propagate)
 *
 * Retry-with-backoff is applied per-call in FastApiNutritionClient using
 * Reactor's retryWhen() so each method can tune retry behaviour independently.
 */
@Configuration
public class WebClientConfig {

    @Value("${nutrifridge.fastapi.base-url}")
    private String baseUrl;

    @Value("${nutrifridge.fastapi.connect-timeout-ms:3000}")
    private int connectTimeoutMs;

    @Value("${nutrifridge.fastapi.read-timeout-ms:10000}")
    private int readTimeoutMs;

    @Bean
    public WebClient fastApiWebClient() {
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, connectTimeoutMs)
                .responseTimeout(Duration.ofMillis(readTimeoutMs))
                .doOnConnected(conn -> conn
                        .addHandlerLast(new ReadTimeoutHandler(readTimeoutMs, TimeUnit.MILLISECONDS))
                        .addHandlerLast(new WriteTimeoutHandler(5_000, TimeUnit.MILLISECONDS)));

        return WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .defaultHeader("Accept", "application/json")
                .filter(statusErrorFilter())
                .build();
    }

    private ExchangeFilterFunction statusErrorFilter() {
        return ExchangeFilterFunction.ofResponseProcessor(response -> {
            HttpStatus status = (HttpStatus) response.statusCode();
            if (status.is4xxClientError() || status.is5xxServerError()) {
                return response.bodyToMono(String.class)
                        .flatMap(body -> Mono.error(new RuntimeException(
                                "FastAPI %s: %s".formatted(status.value(), body))));
            }
            return Mono.just(response);
        });
    }
}
