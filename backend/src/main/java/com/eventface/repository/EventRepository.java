package com.eventface.repository;

import com.eventface.entity.Event;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventRepository extends JpaRepository<Event, UUID> {

    Optional<Event> findByAccessCode(String accessCode);

    boolean existsByAccessCode(String accessCode);
}
