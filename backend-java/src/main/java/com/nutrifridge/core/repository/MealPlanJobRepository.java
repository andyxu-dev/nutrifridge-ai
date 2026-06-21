package com.nutrifridge.core.repository;

import com.nutrifridge.core.domain.JobStatus;
import com.nutrifridge.core.domain.MealPlanJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MealPlanJobRepository extends JpaRepository<MealPlanJob, String> {

    List<MealPlanJob> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, JobStatus status);
}
