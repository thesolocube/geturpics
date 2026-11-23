package com.eventface.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PhotoSearchResultDto {
    private UUID photoId;
    private UUID eventId;
    private String originalKey;
    private String thumbnailKey;
    private String originalUrl;
    private String thumbnailUrl;
    private Integer width;
    private Integer height;
    private Double similarity;
    private Instant createdAt;
}
