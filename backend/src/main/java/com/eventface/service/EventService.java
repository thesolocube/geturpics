package com.eventface.service;

import com.eventface.dto.CreateEventRequest;
import com.eventface.dto.EventResponse;
import com.eventface.entity.Event;
import com.eventface.repository.EventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final EventRepository eventRepository;

    /**
     * Crée un nouvel événement avec génération automatique d'un code unique de 6 caractères.
     */
    @Transactional
    public EventResponse createEvent(CreateEventRequest request) {
        String uniqueAccessCode = generateUniqueAccessCode();

        Event event = Event.builder()
                .photographerId(request.getPhotographerId())
                .title(request.getTitle())
                .description(request.getDescription())
                .accessCode(uniqueAccessCode)
                .eventDate(request.getEventDate())
                .build();

        Event savedEvent = eventRepository.save(event);
        log.info("Événement créé avec succès: id={}, code={}", savedEvent.getId(), savedEvent.getAccessCode());

        return EventResponse.fromEntity(savedEvent);
    }

    /**
     * Recherche et valide un événement via son code d'accès invité.
     */
    @Transactional(readOnly = true)
    public EventResponse getEventByAccessCode(String accessCode) {
        if (accessCode == null || accessCode.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le code d'accès ne peut pas être vide");
        }

        String normalizedCode = accessCode.trim().toUpperCase();
        Event event = eventRepository.findByAccessCode(normalizedCode)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Aucun événement trouvé pour le code d'accès: " + normalizedCode
                ));

        return EventResponse.fromEntity(event);
    }

    /**
     * Recherche un événement par son identifiant UUID.
     */
    @Transactional(readOnly = true)
    public Event getEventEntityById(UUID eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Événement introuvable pour l'identifiant: " + eventId
                ));
    }

    /**
     * Génère un code alphanumérique aléatoire de 6 caractères (majuscules/chiffres non ambigus) garanti unique.
     */
    private String generateUniqueAccessCode() {
        int maxAttempts = 10;
        for (int i = 0; i < maxAttempts; i++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int j = 0; j < CODE_LENGTH; j++) {
                int index = RANDOM.nextInt(CODE_ALPHABET.length());
                sb.append(CODE_ALPHABET.charAt(index));
            }
            String candidateCode = sb.toString();
            if (!eventRepository.existsByAccessCode(candidateCode)) {
                return candidateCode;
            }
        }
        throw new IllegalStateException("Impossible de générer un code d'accès unique après " + maxAttempts + " tentatives");
    }
}
