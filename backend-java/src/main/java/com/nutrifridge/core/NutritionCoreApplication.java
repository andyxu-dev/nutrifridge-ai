package com.nutrifridge.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class NutritionCoreApplication {
    public static void main(String[] args) {
        SpringApplication.run(NutritionCoreApplication.class, args);
    }
}
