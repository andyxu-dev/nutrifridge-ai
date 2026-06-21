package com.nutrifridge.core.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Bounded ThreadPoolTaskExecutor for async meal-plan generation.
 *
 * Core threads handle steady load; the bounded queue absorbs bursts;
 * CallerRunsPolicy prevents unbounded queue growth by slowing the caller.
 * Job status is persisted in the DB so results survive pod restarts.
 */
@Configuration
public class AsyncConfig {

    @Value("${nutrifridge.async.core-pool-size:4}")
    private int corePoolSize;

    @Value("${nutrifridge.async.max-pool-size:8}")
    private int maxPoolSize;

    @Value("${nutrifridge.async.queue-capacity:50}")
    private int queueCapacity;

    @Value("${nutrifridge.async.thread-name-prefix:meal-plan-}")
    private String threadNamePrefix;

    @Bean(name = "mealPlanExecutor")
    public Executor mealPlanExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix(threadNamePrefix);
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
