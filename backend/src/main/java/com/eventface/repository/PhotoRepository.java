package com.eventface.repository;

import com.eventface.entity.Photo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PhotoRepository extends JpaRepository<Photo, UUID> {

    List<Photo> findByEventId(UUID eventId);

    List<Photo> findByEventIdAndStatusOrderByCreatedAtDesc(UUID eventId, String status);

    /**
     * Recherche vectorielle par cosinus pgvector (HNSW index vector_cosine_ops).
     * 1 - (f.embedding <=> CAST(:embedding AS vector)) calcule la similarité cosinus (1.0 = identique).
     */
    @Query(value = """
        SELECT p.id AS id, p.event_id AS eventId, p.original_key AS originalKey, 
               p.thumbnail_key AS thumbnailKey, p.width AS width, p.height AS height, 
               p.status AS status, p.created_at AS createdAt,
               MAX(1 - (f.embedding <=> CAST(:embedding AS vector))) AS similarity
        FROM faces f
        JOIN photos p ON f.photo_id = p.id
        WHERE p.event_id = :eventId 
          AND p.status = 'PROCESSED'
          AND (1 - (f.embedding <=> CAST(:embedding AS vector))) >= :threshold
        GROUP BY p.id, p.event_id, p.original_key, p.thumbnail_key, p.width, p.height, p.status, p.created_at
        ORDER BY similarity DESC
    """, nativeQuery = true)
    List<PhotoSearchProjection> searchByVector(
            @Param("eventId") UUID eventId,
            @Param("embedding") String embedding,
            @Param("threshold") double threshold
    );
}
