package com.eventface.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConfirmUploadRequest {

    @NotNull(message = "L'ID de la photo est obligatoire")
    private UUID photoId;

    private Integer width;

    private Integer height;
}
