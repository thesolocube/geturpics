package com.eventface.controller;

import com.eventface.dto.ConfirmUploadRequest;
import com.eventface.dto.UploadUrlRequest;
import com.eventface.dto.UploadUrlResponse;
import com.eventface.entity.Photo;
import com.eventface.service.PhotoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/photos")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class PhotoController {

    private final PhotoService photoService;

    /**
     * Négocie une URL pré-signée PUT directe vers MinIO pour le téléversement d'une photo.
     * POST /api/v1/photos/upload-url
     */
    @PostMapping("/upload-url")
    public ResponseEntity<UploadUrlResponse> requestUploadUrl(@Valid @RequestBody UploadUrlRequest request) {
        UploadUrlResponse response = photoService.requestUploadUrl(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Confirme que le fichier a été téléversé avec succès dans MinIO et déclenche le worker RabbitMQ.
     * POST /api/v1/photos/confirm
     */
    @PostMapping("/confirm")
    public ResponseEntity<Photo> confirmUpload(@Valid @RequestBody ConfirmUploadRequest request) {
        Photo confirmedPhoto = photoService.confirmUpload(request);
        return ResponseEntity.ok(confirmedPhoto);
    }
}
