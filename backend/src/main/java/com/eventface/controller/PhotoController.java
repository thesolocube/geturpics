package com.eventface.controller;

import com.eventface.dto.*;
import com.eventface.entity.Photo;
import com.eventface.service.PhotoService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.UUID;

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

    /**
     * Récupère toutes les photos traitées d'un événement.
     * GET /api/v1/photos/events/{eventId}
     */
    @GetMapping("/events/{eventId}")
    public ResponseEntity<List<PhotoDetailDto>> getPhotosByEvent(@PathVariable("eventId") UUID eventId) {
        List<PhotoDetailDto> photos = photoService.getPhotosByEvent(eventId);
        return ResponseEntity.ok(photos);
    }

    /**
     * Recherche faciale par selfie dans un événement.
     * POST /api/v1/photos/events/{eventId}/search-by-selfie
     */
    @PostMapping(value = "/events/{eventId}/search-by-selfie", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<PhotoSearchResultDto>> searchBySelfie(
            @PathVariable("eventId") UUID eventId,
            @RequestParam("selfie") MultipartFile selfie,
            @RequestParam(value = "threshold", required = false, defaultValue = "0.45") Double threshold
    ) {
        List<PhotoSearchResultDto> results = photoService.searchPhotosBySelfie(eventId, selfie, threshold);
        return ResponseEntity.ok(results);
    }

    /**
     * Téléchargement d'un pack ZIP de photos sélectionnées.
     * POST /api/v1/photos/events/{eventId}/download-zip
     */
    @PostMapping("/events/{eventId}/download-zip")
    public void downloadSelectedZip(
            @PathVariable("eventId") UUID eventId,
            @RequestBody(required = false) DownloadZipRequest request,
            HttpServletResponse response
    ) throws IOException {
        response.setContentType("application/zip");
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"event_photos.zip\"");

        List<UUID> ids = (request != null) ? request.getPhotoIds() : null;
        photoService.streamZipArchive(eventId, ids, response.getOutputStream());
    }

    /**
     * Téléchargement de l'ensemble des photos d'un événement en ZIP.
     * GET /api/v1/photos/events/{eventId}/download-zip
     */
    @GetMapping("/events/{eventId}/download-zip")
    public void downloadAllZip(
            @PathVariable("eventId") UUID eventId,
            HttpServletResponse response
    ) throws IOException {
        response.setContentType("application/zip");
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"event_all_photos.zip\"");
        photoService.streamZipArchive(eventId, null, response.getOutputStream());
    }

    /**
     * Téléchargement direct d'une photo originale.
     * GET /api/v1/photos/{photoId}/download
     */
    @GetMapping("/{photoId}/download")
    public ResponseEntity<InputStreamResource> downloadSinglePhoto(@PathVariable("photoId") UUID photoId) {
        Photo photo = photoService.getPhotoEntityById(photoId);
        InputStream inputStream = photoService.getPhotoInputStream(photoId);

        String filename = photoId + ".jpg";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.IMAGE_JPEG)
                .body(new InputStreamResource(inputStream));
    }

    /**
     * Affichage direct de la miniature (pour la galerie web).
     * GET /api/v1/photos/{photoId}/thumbnail
     */
    @GetMapping("/{photoId}/thumbnail")
    public ResponseEntity<InputStreamResource> getThumbnail(@PathVariable("photoId") UUID photoId) {
        InputStream inputStream = photoService.getThumbnailInputStream(photoId);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .body(new InputStreamResource(inputStream));
    }

    /**
     * Affichage direct de la photo HD (pour la visionneuse web plein écran).
     * GET /api/v1/photos/{photoId}/view
     */
    @GetMapping("/{photoId}/view")
    public ResponseEntity<InputStreamResource> viewPhoto(@PathVariable("photoId") UUID photoId) {
        InputStream inputStream = photoService.getPhotoInputStream(photoId);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .body(new InputStreamResource(inputStream));
    }
}
