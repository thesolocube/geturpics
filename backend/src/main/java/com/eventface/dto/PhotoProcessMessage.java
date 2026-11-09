package com.eventface.dto;

import lombok.*;

import java.io.Serializable;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PhotoProcessMessage implements Serializable {

    private UUID photoId;
    private UUID eventId;
    private String originalKey;
}
