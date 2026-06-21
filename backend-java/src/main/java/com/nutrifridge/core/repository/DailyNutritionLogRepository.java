package com.nutrifridge.core.repository;

import com.nutrifridge.core.domain.DailyNutritionLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface DailyNutritionLogRepository extends JpaRepository<DailyNutritionLog, Long> {

    Optional<DailyNutritionLog> findByUserIdAndLogDate(String userId, LocalDate logDate);
}
