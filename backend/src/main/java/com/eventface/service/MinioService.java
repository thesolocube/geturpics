package com.eventface.service;

import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class MinioService {

    private final MinioClient minioClient;

    @Value("${minio.bucket:photos}")
    private String bucketName;

    @Value("${minio.expiry-minutes:15}")
    private int defaultExpiryMinutes;

    /**
     * Génère une URL pré-signée sécurisée PUT pour l'upload direct d'une photo vers MinIO (durée 15 min par défaut).
     *
     * @param objectKey chemin/clé unique de stockage dans le bucket
     * @return URL pré-signée en méthode PUT
     */
    public String generatePresignedUploadUrl(String objectKey) {
        return generatePresignedUploadUrl(objectKey, defaultExpiryMinutes);
    }

    /**
     * Génère une URL pré-signée sécurisée PUT avec durée d'expiration personnalisée.
     */
    public String generatePresignedUploadUrl(String objectKey, int expiryMinutes) {
        try {
            return minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucketName)
                            .object(objectKey)
                            .expiry(expiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
        } catch (Exception e) {
            log.error("Erreur lors de la génération de l'URL pré-signée PUT pour la clé {}", objectKey, e);
            throw new RuntimeException("Impossible de générer l'URL d'upload direct MinIO", e);
        }
    }

    /**
     * Génère une URL pré-signée sécurisée GET pour la consultation ou le téléchargement d'un objet.
     *
     * @param objectKey chemin/clé de l'objet dans le bucket
     * @param expiryMinutes durée de validité du lien en minutes
     * @return URL pré-signée en méthode GET
     */
    public String generatePresignedDownloadUrl(String objectKey, int expiryMinutes) {
        try {
            return minioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectKey)
                            .expiry(expiryMinutes, TimeUnit.MINUTES)
                            .build()
            );
        } catch (Exception e) {
            log.error("Erreur lors de la génération de l'URL pré-signée GET pour la clé {}", objectKey, e);
            throw new RuntimeException("Impossible de générer l'URL de téléchargement MinIO", e);
        }
    }
}
