package com.nutrifridge.core.repository;

import com.nutrifridge.core.domain.InventoryItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import java.util.Optional;

public interface InventoryItemRepository extends JpaRepository<InventoryItem, Long> {

    /**
     * Pessimistic write lock used when we know a deduction is imminent,
     * ensuring no concurrent transaction reads stale quantity before we write.
     * Complemented by @Version (optimistic) as a second defence layer.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM InventoryItem i WHERE i.id = :id")
    Optional<InventoryItem> findByIdForUpdate(Long id);
}
