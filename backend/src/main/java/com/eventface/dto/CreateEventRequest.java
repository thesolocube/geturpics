package com.eventface.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateEventRequest {

    @NotNull(message = "L'ID du photographe est obligatoire")
    private UUID photographerId;

    @NotBlank(message = "Le titre de l'événement est obligatoire")
    @Size(max = 150, message = "Le titre ne doit pas dépasser 150 caractères")
    private String title;

    private String description;

    @NotNull(message = "La date de l'événement est obligatoire")
    private LocalDate eventDate;
}
