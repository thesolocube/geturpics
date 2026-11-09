package com.eventface.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadUrlRequest {

    @NotNull(message = "L'ID de l'événement est obligatoire")
    private UUID eventId;

    @NotBlank(message = "Le nom du fichier est obligatoire")
    private String filename;

    @NotBlank(message = "Le type de contenu (MIME type) est obligatoire")
    private String contentType;
}
