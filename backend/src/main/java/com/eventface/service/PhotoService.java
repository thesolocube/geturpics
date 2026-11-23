package com.eventface.service;

import com.eventface.config.RabbitMQConfig;
import com.eventface.dto.*;
import com.eventface.entity.Photo;
import com.eventface.repository.PhotoRepository;
import com.eventface.repository.PhotoSearchProjection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Slf4j
@Service
@RequiredArgsConstructor
public class PhotoService {

    private final PhotoRepository photoRepository;
    private final EventService eventService;
    private final MinioService minioService;
    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    @Value("${ai.worker.url:http://localhost:5001}")
    private String aiWorkerUrl;

    @Value("${minio.expiry-minutes:60}")
    private int expiryMinutes;

    private final RestTemplate restTemplate = new RestTemplate();

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

    /**
     * Récupère la liste de toutes les photos traitées d'un événement avec leurs URLs de prévisualisation et téléchargement.
     */
    @Transactional(readOnly = true)
    public List<PhotoDetailDto> getPhotosByEvent(UUID eventId) {
        eventService.getEventEntityById(eventId);
        List<Photo> photos = photoRepository.findByEventIdAndStatusOrderByCreatedAtDesc(eventId, Photo.STATUS_PROCESSED);

        return photos.stream()
                .map(this::mapToDetailDto)
                .toList();
    }

    /**
     * Recherche faciale par selfie :
     * 1. Appelle le serveur d'IA Worker sur /embed pour obtenir le vecteur ArcFace 512D du visage.
     * 2. Exécute une requête vectorielle de similarité cosinus avec pgvector dans PostgreSQL.
     * 3. Renvoie la liste ordonnée des photos correspondantes avec leurs URLs et scores de similarité.
     */
    @Transactional(readOnly = true)
    public List<PhotoSearchResultDto> searchPhotosBySelfie(UUID eventId, MultipartFile selfieFile, Double threshold) {
        eventService.getEventEntityById(eventId);

        if (selfieFile == null || selfieFile.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le fichier de selfie est requis.");
        }

        double searchThreshold = (threshold != null && threshold > 0.0 && threshold <= 1.0) ? threshold : 0.50;

        // 1. Extraction de l'embedding du visage via le Worker IA
        String vectorString = extractEmbeddingFromSelfie(selfieFile);

        // 2. Recherche vectorielle dans PostgreSQL avec pgvector
        List<PhotoSearchProjection> matches = photoRepository.searchByVector(eventId, vectorString, searchThreshold);
        log.info("Recherche par selfie pour l'événement {}: {} photo(s) trouvée(s) avec seuil >= {}",
                eventId, matches.size(), searchThreshold);

        // 3. Mapping vers DTO avec URLs pré-signées
        return matches.stream()
                .map(match -> {
                    String thumbKey = (match.getThumbnailKey() != null && !match.getThumbnailKey().isBlank())
                            ? match.getThumbnailKey()
                            : match.getOriginalKey();

                    return PhotoSearchResultDto.builder()
                            .photoId(match.getId())
                            .eventId(match.getEventId())
                            .originalKey(match.getOriginalKey())
                            .thumbnailKey(match.getThumbnailKey())
                            .thumbnailUrl(minioService.generatePresignedDownloadUrl(thumbKey, expiryMinutes))
                            .originalUrl(minioService.generatePresignedDownloadUrl(match.getOriginalKey(), expiryMinutes))
                            .width(match.getWidth())
                            .height(match.getHeight())
                            .similarity(Math.round(match.getSimilarity() * 1000.0) / 10.0) // ex: 89.5%
                            .createdAt(match.getCreatedAt())
                            .build();
                })
                .toList();
    }

    /**
     * Télécharge un flux ZIP contenant les photos spécifiées (ou toutes les photos de l'événement si aucune sélection).
     */
    @Transactional(readOnly = true)
    public void streamZipArchive(UUID eventId, List<UUID> photoIds, OutputStream outputStream) {
        eventService.getEventEntityById(eventId);

        List<Photo> photosToZip;
        if (photoIds != null && !photoIds.isEmpty()) {
            photosToZip = photoRepository.findAllById(photoIds).stream()
                    .filter(p -> p.getEventId().equals(eventId) && Photo.STATUS_PROCESSED.equals(p.getStatus()))
                    .toList();
        } else {
            photosToZip = photoRepository.findByEventIdAndStatusOrderByCreatedAtDesc(eventId, Photo.STATUS_PROCESSED);
        }

        if (photosToZip.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Aucune photo disponible pour l'archive ZIP.");
        }

        try (ZipOutputStream zos = new ZipOutputStream(outputStream)) {
            byte[] buffer = new byte[8192];
            int counter = 1;

            for (Photo photo : photosToZip) {
                String entryName = String.format("photo_%03d_%s.jpg", counter++, photo.getId().toString().substring(0, 8));
                zos.putNextEntry(new ZipEntry(entryName));

                try (InputStream is = minioService.getObjectInputStream(photo.getOriginalKey())) {
                    int bytesRead;
                    while ((bytesRead = is.read(buffer)) != -1) {
                        zos.write(buffer, 0, bytesRead);
                    }
                } catch (Exception e) {
                    log.warn("Impossible d'inclure la photo {} dans l'archive ZIP: {}", photo.getId(), e.getMessage());
                }
                zos.closeEntry();
            }
            zos.finish();
        } catch (Exception e) {
            log.error("Erreur lors de la création du flux ZIP pour l'événement {}", eventId, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur lors de la génération du fichier ZIP");
        }
    }

    /**
     * Récupère le flux direct de la photo originale pour affichage ou téléchargement unitaire.
     */
    @Transactional(readOnly = true)
    public InputStream getPhotoInputStream(UUID photoId) {
        Photo photo = photoRepository.findById(photoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo introuvable"));
        return minioService.getObjectInputStream(photo.getOriginalKey());
    }

    /**
     * Récupère le flux direct de la miniature optimisée (thumbnail).
     */
    @Transactional(readOnly = true)
    public InputStream getThumbnailInputStream(UUID photoId) {
        Photo photo = photoRepository.findById(photoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo introuvable"));
        String key = (photo.getThumbnailKey() != null && !photo.getThumbnailKey().isBlank())
                ? photo.getThumbnailKey()
                : photo.getOriginalKey();
        return minioService.getObjectInputStream(key);
    }

    @Transactional(readOnly = true)
    public Photo getPhotoEntityById(UUID photoId) {
        return photoRepository.findById(photoId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo introuvable"));
    }

    private PhotoDetailDto mapToDetailDto(Photo photo) {
        String thumbKey = (photo.getThumbnailKey() != null && !photo.getThumbnailKey().isBlank())
                ? photo.getThumbnailKey()
                : photo.getOriginalKey();

        return PhotoDetailDto.builder()
                .id(photo.getId())
                .eventId(photo.getEventId())
                .originalKey(photo.getOriginalKey())
                .thumbnailKey(photo.getThumbnailKey())
                .thumbnailUrl(minioService.generatePresignedDownloadUrl(thumbKey, expiryMinutes))
                .originalUrl(minioService.generatePresignedDownloadUrl(photo.getOriginalKey(), expiryMinutes))
                .width(photo.getWidth())
                .height(photo.getHeight())
                .status(photo.getStatus())
                .createdAt(photo.getCreatedAt())
                .build();
    }

    private String extractEmbeddingFromSelfie(MultipartFile selfieFile) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);

            HttpEntity<byte[]> requestEntity = new HttpEntity<>(selfieFile.getBytes(), headers);
            String url = aiWorkerUrl + "/embed";

            ResponseEntity<String> response = restTemplate.postForEntity(url, requestEntity, String.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Le service d'analyse faciale est indisponible");
            }

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode faces = root.get("faces");
            if (faces == null || !faces.isArray() || faces.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucun visage n'a été détecté sur votre selfie. Veuillez reprendre une photo bien éclairée de face.");
            }

            // Récupère l'embedding du premier visage détecté
            JsonNode embeddingNode = faces.get(0).get("embedding");
            if (embeddingNode == null || !embeddingNode.isArray()) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Format de signature faciale invalide renvoyé par l'IA");
            }

            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < embeddingNode.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(embeddingNode.get(i).asDouble());
            }
            sb.append("]");

            return sb.toString();
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("Erreur de communication avec le Worker IA ({}) : {}", aiWorkerUrl, e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Échec de l'analyse du selfie par l'IA: " + e.getMessage());
        }
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "photo.jpg";
        }
        return filename.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
