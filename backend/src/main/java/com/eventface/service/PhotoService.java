package com.eventface.service;

import com.eventface.config.RabbitMQConfig;
import com.eventface.dto.ConfirmUploadRequest;
import com.eventface.dto.PhotoProcessMessage;
import com.eventface.dto.UploadUrlRequest;
import com.eventface.dto.UploadUrlResponse;
import com.eventface.entity.Photo;
import com.eventface.repository.PhotoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PhotoService {

    private final PhotoRepository photoRepository;
    private final EventService eventService;
    private final MinioService minioService;
    private final RabbitTemplate rabbitTemplate;

    /**
     * Négocie une URL pré-signée PUT directe vers MinIO pour le téléversement de la photo originale.
     */
    @Transactional
    public UploadUrlResponse requestUploadUrl(UploadUrlRequest request) {
        // Valide l'existence de l'événement
        eventService.getEventEntityById(request.getEventId());

        UUID photoId = UUID.randomUUID();
        String sanitizedFilename = sanitizeFilename(request.getFilename());
        String objectKey = String.format("events/%s/original/%s_%s",
                request.getEventId(),
                photoId,
                sanitizedFilename
        );

        // Création et persistance de la photo au statut UPLOADING
        Photo photo = Photo.builder()
                .id(photoId)
                .eventId(request.getEventId())
                .originalKey(objectKey)
                .status(Photo.STATUS_UPLOADING)
                .build();

        photoRepository.save(photo);

        // Génération de l'URL pré-signée PUT MinIO
        String presignedUploadUrl = minioService.generatePresignedUploadUrl(objectKey);

        log.info("URL pré-signée générée pour photoId={}, clé={}", photoId, objectKey);

        return UploadUrlResponse.builder()
                .photoId(photoId)
                .uploadUrl(presignedUploadUrl)
                .objectKey(objectKey)
                .build();
    }

    /**
     * Confirme l'upload auprès du backend, bascule le statut en PENDING et émet un message asynchrone RabbitMQ.
     */
    @Transactional
    public Photo confirmUpload(ConfirmUploadRequest request) {
        Photo photo = photoRepository.findById(request.getPhotoId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Photo introuvable pour l'identifiant: " + request.getPhotoId()
                ));

        photo.setStatus(Photo.STATUS_PENDING);
        if (request.getWidth() != null) {
            photo.setWidth(request.getWidth());
        }
        if (request.getHeight() != null) {
            photo.setHeight(request.getHeight());
        }

        Photo savedPhoto = photoRepository.save(photo);

        // Émission du message JSON vers le TopicExchange RabbitMQ
        PhotoProcessMessage message = PhotoProcessMessage.builder()
                .photoId(savedPhoto.getId())
                .eventId(savedPhoto.getEventId())
                .originalKey(savedPhoto.getOriginalKey())
                .build();

        rabbitTemplate.convertAndSend(
                RabbitMQConfig.EXCHANGE_NAME,
                RabbitMQConfig.ROUTING_KEY,
                message
        );

        log.info("Confirmation d'upload réussie pour photoId={}. Message émis vers RabbitMQ [exchange={}, routingKey={}]",
                savedPhoto.getId(),
                RabbitMQConfig.EXCHANGE_NAME,
                RabbitMQConfig.ROUTING_KEY
        );

        return savedPhoto;
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "photo.jpg";
        }
        return filename.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
