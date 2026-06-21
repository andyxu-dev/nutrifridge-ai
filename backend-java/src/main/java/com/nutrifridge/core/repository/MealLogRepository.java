package com.nutrifridge.core.repository;

import com.nutrifridge.core.domain.MealLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MealLogRepository extends JpaRepository<MealLog, Long> {

    List<MealLog> findByDailyLogIdOrderByLoggedAtAsc(Long dailyLogId);
}
