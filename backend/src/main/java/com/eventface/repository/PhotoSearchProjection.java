package com.eventface.repository;

import java.time.Instant;
import java.util.UUID;

public interface PhotoSearchProjection {
    UUID getId();
    UUID getEventId();
    String getOriginalKey();
    String getThumbnailKey();
    Integer getWidth();
    Integer getHeight();
    String getStatus();
    Instant getCreatedAt();
    Double getSimilarity();
}
