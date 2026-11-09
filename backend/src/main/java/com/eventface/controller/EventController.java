package com.eventface.controller;

import com.eventface.dto.CreateEventRequest;
import com.eventface.dto.EventResponse;
import com.eventface.service.EventService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/events")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class EventController {

    private final EventService eventService;

    /**
     * Crée un nouvel événement et génère un code invité unique.
     * POST /api/v1/events
     */
    @PostMapping
    public ResponseEntity<EventResponse> createEvent(@Valid @RequestBody CreateEventRequest request) {
        EventResponse response = eventService.createEvent(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Valide et récupère un événement à partir de son code d'accès invité (ex: GALA26).
     * GET /api/v1/events/access?code=...
     */
    @GetMapping("/access")
    public ResponseEntity<EventResponse> getEventByAccessCode(@RequestParam("code") String code) {
        EventResponse response = eventService.getEventByAccessCode(code);
        return ResponseEntity.ok(response);
    }
}
