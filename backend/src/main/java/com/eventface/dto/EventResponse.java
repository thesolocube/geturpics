package com.eventface.dto;

import com.eventface.entity.Event;
import lombok.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EventResponse {

    private UUID id;
    private UUID photographerId;
    private String title;
    private String description;
    private String accessCode;
    private LocalDate eventDate;
    private Instant createdAt;

    public static EventResponse fromEntity(Event event) {
        if (event == null) {
            return null;
        }
        return EventResponse.builder()
                .id(event.getId())
                .photographerId(event.getPhotographerId())
                .title(event.getTitle())
                .description(event.getDescription())
                .accessCode(event.getAccessCode())
                .eventDate(event.getEventDate())
                .createdAt(event.getCreatedAt())
                .build();
    }
}
