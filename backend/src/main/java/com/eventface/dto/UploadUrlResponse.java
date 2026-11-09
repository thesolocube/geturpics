package com.eventface.dto;

import lombok.*;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UploadUrlResponse {

    private UUID photoId;
    private String uploadUrl;
    private String objectKey;
}
