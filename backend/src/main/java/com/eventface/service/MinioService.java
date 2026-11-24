package com.eventface.service;

import io.minio.GetObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class MinioService {

    private final MinioClient minioClient;
    private final MinioClient publicMinioClient;

    @Value("${minio.bucket:photos}")
    private String bucketName;

    @Value("${minio.expiry-minutes:15}")
    private int defaultExpiryMinutes;

    public MinioService(
            MinioClient minioClient,
            @Qualifier("publicMinioClient") MinioClient publicMinioClient
    ) {
        this.minioClient = minioClient;
        this.publicMinioClient = publicMinioClient;
    }

    /**
     * Génère une URL pré-signée sécurisée PUT pour l'upload direct d'une photo vers MinIO (durée 15 min par défaut).
     */
    public String generatePresignedUploadUrl(String objectKey) {
        return generatePresignedUploadUrl(objectKey, defaultExpiryMinutes);
    }

    /**
     * Génère une URL pré-signée sécurisée PUT avec durée d'expiration personnalisée.
     */
    public String generatePresignedUploadUrl(String objectKey, int expiryMinutes) {
        try {
            return publicMinioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.PUT)
                            .bucket(bucketName)
                            .object(objectKey)
                            .expiry(expiryMinutes, TimeUnit.MINUTES)
                            .region("us-east-1")
                            .build()
            );
        } catch (Exception e) {
            log.error("Erreur lors de la génération de l'URL pré-signée PUT pour la clé {}", objectKey, e);
            throw new RuntimeException("Impossible de générer l'URL d'upload direct MinIO", e);
        }
    }

    /**
     * Génère une URL pré-signée sécurisée GET pour la consultation ou le téléchargement d'un objet.
     */
    public String generatePresignedDownloadUrl(String objectKey, int expiryMinutes) {
        try {
            return publicMinioClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectKey)
                            .expiry(expiryMinutes, TimeUnit.MINUTES)
                            .region("us-east-1")
                            .build()
            );
        } catch (Exception e) {
            log.error("Erreur lors de la génération de l'URL pré-signée GET pour la clé {}", objectKey, e);
            throw new RuntimeException("Impossible de générer l'URL de téléchargement MinIO", e);
        }
    }

    /**
     * Récupère le flux binaire brut d'un objet stocké dans MinIO (pour le streaming ZIP ou téléchargement direct).
     */
    public InputStream getObjectInputStream(String objectKey) {
        try {
            return minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(bucketName)
                            .object(objectKey)
                            .build()
            );
        } catch (Exception e) {
            log.error("Erreur lors de la lecture du flux MinIO pour la clé {}", objectKey, e);
            throw new RuntimeException("Impossible de lire l'objet dans MinIO: " + objectKey, e);
        }
    }
}
