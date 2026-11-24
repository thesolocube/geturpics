/**
 * EventFace — Premium Application Logic
 * Architecture : Spring Boot (8081) + MinIO (9000) + Worker AI (5001) + PostgreSQL pgvector
 */

// Détection automatique de l'hôte API (supporte direct port 3000 -> 8081 ou proxy/same origin)
const API_BASE = window.location.port === "8081" 
  ? "/api/v1" 
  : `${window.location.protocol}//${window.location.hostname}:8081/api/v1`;

const PHOTOGRAPHER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// État global réactif
const state = {
  currentTab: 'guest',
  events: [],
  selectedEvent: null,
  photos: [],
  activeGalleryList: [],
  selectedPhotoIds: new Set(),
  searchResults: null,
  isSearching: false,
  lightboxIndex: 0,
  webcamStream: null
};

/* ==========================================================================
   1. SYSTÈME DE NOTIFICATIONS TOAST (UI Moderne sans alert())
   ========================================================================== */
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconSvg = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  }[type] || '';

  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()" aria-label="Fermer">✕</button>
  `;

  container.appendChild(toast);

  // Auto-suppression
  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('toast-fadeout');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }
  return toast;
}

/* ==========================================================================
   2. INITIALISATION AU CHARGEMENT DU DOM
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  checkApiHealth();
  setupPhotographerForms();
  setupGuestSearch();
  setupDropzone();
  setupKeyboardNavigation();

  // Date du jour par défaut
  const dateInput = document.getElementById('event-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Chargement des événements
  loadEvents();
});

/* ==========================================================================
   3. NAVIGATION PAR ONGLETS
   ========================================================================== */
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      state.currentTab = target;

      const guestView = document.getElementById('guest-view');
      const photographerView = document.getElementById('photographer-view');

      if (target === 'photographer') {
        guestView.style.display = 'none';
        photographerView.style.display = 'block';
        loadEvents();
      } else {
        photographerView.style.display = 'none';
        guestView.style.display = 'block';
      }
    });
  });
}

async function checkApiHealth() {
  const statusEl = document.getElementById('api-status');
  if (!statusEl) return;

  try {
    const res = await fetch(`${API_BASE}/events`, { method: 'GET' });
    if (res.ok) {
      statusEl.innerHTML = `<span class="status-dot"></span> <span>Backend & IA Connectés</span>`;
      statusEl.className = 'status-badge status-online';
    } else {
      statusEl.innerHTML = `<span class="status-dot status-warn"></span> <span>API HTTP ${res.status}</span>`;
      statusEl.className = 'status-badge status-warning';
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="status-dot status-err"></span> <span>Hors ligne (port 8081)</span>`;
    statusEl.className = 'status-badge status-offline';
  }
}

/* ==========================================================================
   4. ESPACE PHOTOGRAPHE
   ========================================================================== */
function setupPhotographerForms() {
  const form = document.getElementById('create-event-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('event-title');
    const dateInput = document.getElementById('event-date');
    const descInput = document.getElementById('event-description');
    const submitBtn = form.querySelector('button[type="submit"]');

    const title = titleInput.value.trim();
    const eventDate = dateInput.value;
    const description = descInput ? descInput.value.trim() : '';

    if (!title || !eventDate) {
      showToast("Veuillez renseigner le titre et la date.", "error");
      return;
    }

    setButtonLoading(submitBtn, true, "Création en cours...");

    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photographerId: PHOTOGRAPHER_ID,
          title,
          eventDate,
          description
        })
      });

      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      const newEvent = await res.json();

      showToast(`🎉 Événement "${newEvent.title}" créé ! Code : ${newEvent.accessCode}`, "success", 6000);
      copyToClipboard(newEvent.accessCode, false);

      form.reset();
      dateInput.value = new Date().toISOString().split('T')[0];

      await loadEvents();
      selectPhotographerEvent(newEvent.id);
    } catch (err) {
      showToast(`Échec de création : ${err.message}`, "error");
    } finally {
      setButtonLoading(submitBtn, false, `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Créer l'événement`);
    }
  });
}

async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) return;
    state.events = await res.json();
    renderPhotographerEvents();
    renderGuestRecentEvents();
  } catch (err) {
    console.error("Erreur chargement événements:", err);
  }
}

function renderPhotographerEvents() {
  const grid = document.getElementById('photographer-events-grid');
  if (!grid) return;

  if (!state.events || state.events.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">📁</div>
        <h3>Aucun événement pour le moment</h3>
        <p>Créez votre premier événement ci-dessus pour commencer à importer vos clichés.</p>
      </div>`;
    return;
  }

  grid.innerHTML = state.events.map(evt => `
    <div class="event-card">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; margin-bottom:0.75rem;">
          <h3 style="font-size:1.15rem; font-weight:700; line-height:1.3;">${escapeHtml(evt.title)}</h3>
          <span class="event-code-badge" title="Cliquer pour copier le code" onclick="copyToClipboard('${evt.accessCode}')">
            🔑 ${evt.accessCode}
          </span>
        </div>
        <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.4rem;">
          <span>📅</span> ${formatDate(evt.eventDate)}
        </p>
        <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.4;">
          ${escapeHtml(evt.description || 'Aucune description')}
        </p>
      </div>
      <div style="margin-top:1.25rem; display:flex; gap:0.6rem; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="selectPhotographerEvent('${evt.id}')">
          📷 Gérer l'album
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openGuestEvent('${evt.accessCode}')">
          👁️ Vue Invité
        </button>
      </div>
    </div>
  `).join('');
}

async function selectPhotographerEvent(eventId) {
  const evt = state.events.find(e => e.id === eventId);
  if (!evt) return;

  state.selectedEvent = evt;
  const section = document.getElementById('manage-event-section');
  section.style.display = 'block';

  document.getElementById('manage-event-title').innerText = evt.title;
  document.getElementById('manage-event-code').innerText = evt.accessCode;

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await loadPhotographerPhotos(eventId);
}

async function loadPhotographerPhotos(eventId) {
  const grid = document.getElementById('photographer-photos-grid');
  const countEl = document.getElementById('photographer-photo-count');

  if (grid) {
    grid.innerHTML = `
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>`;
  }

  try {
    const res = await fetch(`${API_BASE}/photos/events/${eventId}`);
    if (!res.ok) throw new Error("Erreur de récupération des photos");
    const photos = await res.json();
    state.photos = photos;
    if (countEl) countEl.innerText = `${photos.length} photo(s)`;
    renderPhotographerPhotos(photos);
  } catch (err) {
    if (grid) grid.innerHTML = `<p style="color:var(--danger); grid-column:1/-1;">Erreur: ${err.message}</p>`;
  }
}

function renderPhotographerPhotos(photos) {
  const grid = document.getElementById('photographer-photos-grid');
  if (!grid) return;

  if (photos.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; padding:2rem 1rem;">
        <div class="empty-icon">📷</div>
        <p>Cet album est vide pour l'instant. Glissez-y vos premières photos ci-dessus !</p>
      </div>`;
    return;
  }

  grid.innerHTML = photos.map(p => `
    <div class="photo-item" onclick="openLightboxDirect('${p.id}')">
      <img class="photo-img" src="${API_BASE}/photos/${p.id}/thumbnail" loading="lazy" alt="Photo"
           onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'/><text x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2394a3b8\\' font-size=\\'12\\'>Non dispo</text></svg>'"/>
      <div class="photo-overlay">
        <div>
          <span class="badge" style="background:rgba(0,0,0,0.7); backdrop-filter:blur(4px);">
            ${p.width || '?'}×${p.height || '?'}
          </span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <span style="font-size:0.75rem; color:#10b981; font-weight:600;">✓ IA Traité</span>
          <a href="${API_BASE}/photos/${p.id}/download" class="btn btn-secondary btn-sm btn-icon" 
             onclick="event.stopPropagation();" title="Télécharger HD" download>
            ⬇
          </a>
        </div>
      </div>
    </div>
  `).join('');
}

/* ==========================================================================
   5. TÉLÉVERSEMENT DRAG & DROP & MINIO DIRECT
   ========================================================================== */
function setupDropzone() {
  const dropzone = document.getElementById('photo-dropzone');
  const fileInput = document.getElementById('photo-file-input');
  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFilesUpload(files);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFilesUpload(fileInput.files);
  });
}

async function handleFilesUpload(fileList) {
  if (!state.selectedEvent) {
    showToast("Veuillez d'abord sélectionner un événement.", "error");
    return;
  }

  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) {
    showToast("Veuillez sélectionner des images (JPEG, PNG).", "error");
    return;
  }

  const progressContainer = document.getElementById('upload-progress-container');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');
  progressContainer.style.display = 'block';

  let completed = 0;
  for (const file of files) {
    progressText.innerText = `Envoi de ${file.name} (${completed + 1}/${files.length})...`;

    try {
      // 1. Demande d'URL pré-signée PUT
      const urlRes = await fetch(`${API_BASE}/photos/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: state.selectedEvent.id,
          filename: file.name,
          contentType: file.type || 'image/jpeg'
        })
      });

      if (!urlRes.ok) throw new Error("Erreur URL pré-signée MinIO");
      const { photoId, uploadUrl } = await urlRes.json();

      // Remplacement si docker utilise minio:9000
      let directUploadUrl = uploadUrl;
      if (directUploadUrl.includes("http://minio:9000")) {
        directUploadUrl = directUploadUrl.replace("http://minio:9000", `${window.location.protocol}//${window.location.hostname}:9000`);
      }

      // 2. Upload binaire direct vers MinIO
      const putRes = await fetch(directUploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file
      });

      if (!putRes.ok) throw new Error("Échec upload binaire vers MinIO");

      // 3. Confirmation backend (déclenche RabbitMQ -> IA Worker)
      await fetch(`${API_BASE}/photos/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photoId })
      });

      completed++;
      const percent = Math.round((completed / files.length) * 100);
      progressBar.style.width = `${percent}%`;
    } catch (err) {
      console.error(`Erreur upload pour ${file.name}:`, err);
    }
  }

  progressText.innerText = `✅ ${completed} photo(s) envoyée(s) ! Traitement par l'IA en cours...`;
  showToast(`✅ ${completed} photo(s) uploadée(s) ! L'IA détecte les visages...`, "success");

  setTimeout(() => {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
  }, 4500);

  // Rafraîchir les photos après quelques secondes
  setTimeout(() => {
    if (state.selectedEvent) loadPhotographerPhotos(state.selectedEvent.id);
  }, 3500);
}

/* ==========================================================================
   6. ESPACE INVITÉ
   ========================================================================== */
function setupGuestSearch() {
  const codeForm = document.getElementById('guest-code-form');
  if (!codeForm) return;

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('guest-code-input');
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    await openGuestEvent(code);
  });
}

function renderGuestRecentEvents() {
  const container = document.getElementById('guest-recent-events');
  if (!container) return;

  if (!state.events || state.events.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:0.6rem; text-align:center;">
      Ou rejoignez un événement récent :
    </p>
    <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:0.5rem;">
      ${state.events.slice(0, 6).map(e => `
        <button type="button" class="btn btn-secondary btn-sm" onclick="openGuestEvent('${e.accessCode}')">
          ${escapeHtml(e.title)} <span style="font-family:monospace; color:var(--accent-primary); font-weight:700;">(${e.accessCode})</span>
        </button>
      `).join('')}
    </div>
  `;
}

async function openGuestEvent(accessCode) {
  try {
    const res = await fetch(`${API_BASE}/events/access?code=${encodeURIComponent(accessCode)}`);
    if (!res.ok) {
      showToast("Code d'accès introuvable ou incorrect.", "error");
      return;
    }

    const eventData = await res.json();
    state.selectedEvent = eventData;
    state.searchResults = null;

    // Basculer sur l'onglet invité
    const guestTab = document.querySelector('.nav-tab[data-tab="guest"]');
    if (guestTab && !guestTab.classList.contains('active')) {
      guestTab.click();
    }

    document.getElementById('guest-welcome-screen').style.display = 'none';
    document.getElementById('guest-gallery-screen').style.display = 'block';

    document.getElementById('guest-event-title').innerText = eventData.title;
    document.getElementById('guest-event-date').innerText = formatDate(eventData.eventDate);
    document.getElementById('guest-event-code').innerText = eventData.accessCode;

    await loadGuestGallery(eventData.id);
    showToast(`Bienvenue dans "${eventData.title}" !`, "info");
  } catch (err) {
    showToast("Erreur de connexion : " + err.message, "error");
  }
}

async function loadGuestGallery(eventId) {
  const grid = document.getElementById('guest-photos-grid');
  if (grid) {
    grid.innerHTML = `
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>`;
  }

  try {
    const res = await fetch(`${API_BASE}/photos/events/${eventId}`);
    if (!res.ok) throw new Error("Impossible de charger la galerie");
    state.photos = await res.json();
    state.activeGalleryList = state.photos;
    state.selectedPhotoIds.clear();
    updateSelectionBar();
    renderGuestGallery(state.photos);
  } catch (err) {
    if (grid) grid.innerHTML = `<p style="color:var(--danger); grid-column:1/-1;">Erreur: ${err.message}</p>`;
  }
}

function renderGuestGallery(photos, isSearchResult = false) {
  const grid = document.getElementById('guest-photos-grid');
  const counter = document.getElementById('guest-photo-counter');
  if (counter) counter.innerText = `${photos.length} photo(s)`;

  if (!grid) return;

  if (photos.length === 0) {
    if (isSearchResult) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">🔍</div>
          <h3>Aucune photo trouvée avec ce visage</h3>
          <p>Essayez avec un autre selfie sous un meilleur angle ou réduisez la sensibilité.</p>
          <button class="btn btn-secondary" style="margin-top:1rem;" onclick="resetGuestSearch()">
            Voir tout l'album
          </button>
        </div>
      `;
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">📷</div>
          <h3>Aucune photo pour l'instant</h3>
          <p>Le photographe n'a pas encore ajouté de photos dans cet album.</p>
        </div>
      `;
    }
    return;
  }

  grid.innerHTML = photos.map((p, idx) => {
    const photoId = p.photoId || p.id;
    const isSelected = state.selectedPhotoIds.has(photoId);
    const matchBadge = p.similarity 
      ? `<span class="photo-match-badge">🎯 ${Math.round(p.similarity)}% match</span>` 
      : '';

    return `
      <div class="photo-item" onclick="openLightboxIndex(${idx})">
        <img class="photo-img" src="${API_BASE}/photos/${photoId}/thumbnail" loading="lazy" alt="Photo"
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'/><text x=\\'50%\\' y=\\'50%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%2394a3b8\\' font-size=\\'12\\'>Non dispo</text></svg>'"/>
        ${matchBadge}
        <div class="photo-overlay">
          <input type="checkbox" class="photo-checkbox" ${isSelected ? 'checked' : ''} 
                 onclick="togglePhotoSelection('${photoId}', event)" title="Sélectionner"/>
          <div style="display:flex; justify-content:flex-end;">
            <a href="${API_BASE}/photos/${photoId}/download" class="btn btn-secondary btn-sm btn-icon" 
               onclick="event.stopPropagation();" title="Télécharger HD" download>
              ⬇
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function exitGuestEvent() {
  document.getElementById('guest-welcome-screen').style.display = 'block';
  document.getElementById('guest-gallery-screen').style.display = 'none';
  state.selectedEvent = null;
  state.photos = [];
  state.searchResults = null;
  state.selectedPhotoIds.clear();
  updateSelectionBar();
}

function resetGuestSearch() {
  state.searchResults = null;
  state.activeGalleryList = state.photos;
  const banner = document.getElementById('search-filter-banner');
  if (banner) banner.style.display = 'none';
  renderGuestGallery(state.photos);
  showToast("Affichage de toutes les photos.", "info");
}

/* ==========================================================================
   7. RECHERCHE BIOMÉTRIQUE PAR SELFIE (MODULE IA)
   ========================================================================== */
function openSelfieModal() {
  const modal = document.getElementById('selfie-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  switchSelfieMode('upload');
}

function closeSelfieModal() {
  stopWebcam();
  const modal = document.getElementById('selfie-modal');
  if (modal) modal.style.display = 'none';
}

function switchSelfieMode(mode) {
  const uploadPane = document.getElementById('selfie-upload-pane');
  const cameraPane = document.getElementById('selfie-camera-pane');
  const tabs = document.querySelectorAll('.selfie-mode-tab');

  if (uploadPane) uploadPane.style.display = (mode === 'upload') ? 'block' : 'none';
  if (cameraPane) cameraPane.style.display = (mode === 'camera') ? 'block' : 'none';

  tabs.forEach((tab, i) => {
    if ((mode === 'upload' && i === 0) || (mode === 'camera' && i === 1)) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  if (mode === 'camera') {
    startWebcam();
  } else {
    stopWebcam();
  }
}

async function startWebcam() {
  const video = document.getElementById('webcam-video');
  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 } }
    });
    state.webcamStream = stream;
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    showToast("Impossible d'accéder à la webcam : " + err.message, "error");
    switchSelfieMode('upload');
  }
}

function stopWebcam() {
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(track => track.stop());
    state.webcamStream = null;
  }
}

function captureWebcamPhoto() {
  const video = document.getElementById('webcam-video');
  if (!video) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    if (blob) executeSelfieSearch(blob);
  }, 'image/jpeg', 0.95);
}

function handleSelfieFileSelected(input) {
  if (input.files && input.files[0]) {
    executeSelfieSearch(input.files[0]);
  }
}

async function executeSelfieSearch(fileOrBlob) {
  if (!state.selectedEvent) return;

  const thresholdInput = document.getElementById('selfie-threshold');
  const threshold = thresholdInput ? thresholdInput.value : "0.45";

  const scanningOverlay = document.getElementById('selfie-scanning-overlay');
  if (scanningOverlay) scanningOverlay.style.display = 'flex';

  const formData = new FormData();
  formData.append('selfie', fileOrBlob, 'selfie.jpg');
  formData.append('threshold', threshold);

  try {
    const res = await fetch(`${API_BASE}/photos/events/${state.selectedEvent.id}/search-by-selfie`, {
      method: 'POST',
      body: formData
    });

    if (scanningOverlay) scanningOverlay.style.display = 'none';
    closeSelfieModal();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showToast(errData.message || "Aucun visage détecté sur ce selfie.", "error");
      return;
    }

    const matches = await res.json();
    state.searchResults = matches;
    state.activeGalleryList = matches;

    const banner = document.getElementById('search-filter-banner');
    const textEl = document.getElementById('search-matches-text');

    if (banner) banner.style.display = 'flex';
    if (textEl) textEl.innerText = `✨ ${matches.length} photo(s) trouvée(s) avec votre visage !`;

    renderGuestGallery(matches, true);
    showToast(`🎯 L'IA a trouvé ${matches.length} photo(s) correspondante(s) !`, "success");
  } catch (err) {
    if (scanningOverlay) scanningOverlay.style.display = 'none';
    showToast("Erreur lors de la recherche : " + err.message, "error");
  }
}

/* ==========================================================================
   8. SÉLECTION ET TÉLÉCHARGEMENT GROUPÉ (ZIP)
   ========================================================================== */
function togglePhotoSelection(photoId, event) {
  event.stopPropagation();
  if (state.selectedPhotoIds.has(photoId)) {
    state.selectedPhotoIds.delete(photoId);
  } else {
    state.selectedPhotoIds.add(photoId);
  }
  updateSelectionBar();
}

function selectAllPhotos() {
  state.activeGalleryList.forEach(p => {
    const id = p.photoId || p.id;
    state.selectedPhotoIds.add(id);
  });
  updateSelectionBar();
  renderGuestGallery(state.activeGalleryList, !!state.searchResults);
}

function clearSelection() {
  state.selectedPhotoIds.clear();
  updateSelectionBar();
  renderGuestGallery(state.activeGalleryList, !!state.searchResults);
}

function updateSelectionBar() {
  const bar = document.getElementById('selection-action-bar');
  const countEl = document.getElementById('selected-count-label');
  const count = state.selectedPhotoIds.size;

  if (countEl) countEl.innerText = `${count} sélectionnée(s)`;
  if (bar) {
    bar.style.display = count > 0 ? 'flex' : 'none';
  }
}

async function downloadSelectedZip() {
  if (!state.selectedEvent || state.selectedPhotoIds.size === 0) return;

  const btn = document.getElementById('btn-download-selected');
  setButtonLoading(btn, true, "Préparation du ZIP...");

  try {
    const res = await fetch(`${API_BASE}/photos/events/${state.selectedEvent.id}/download-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoIds: Array.from(state.selectedPhotoIds)
      })
    });

    if (!res.ok) throw new Error("Erreur génération ZIP");

    const blob = await res.blob();
    triggerBlobDownload(blob, `selection_${state.selectedEvent.accessCode}.zip`);
    showToast("Archive ZIP téléchargée !", "success");
  } catch (err) {
    showToast("Erreur de téléchargement : " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Télécharger la sélection`);
  }
}

function downloadAllZip() {
  if (!state.selectedEvent) return;
  showToast("Préparation de l'archive complète...", "info");
  window.location.href = `${API_BASE}/photos/events/${state.selectedEvent.id}/download-zip`;
}

function triggerBlobDownload(blob, filename) {
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
}

/* ==========================================================================
   9. VISIONNEUSE PLEIN ÉCRAN (LIGHTBOX HD)
   ========================================================================== */
function openLightboxIndex(index) {
  if (!state.activeGalleryList || index < 0 || index >= state.activeGalleryList.length) return;
  state.lightboxIndex = index;
  const photo = state.activeGalleryList[index];
  const photoId = photo.photoId || photo.id;

  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-image');
  const downloadBtn = document.getElementById('lightbox-download-btn');

  if (img) img.src = `${API_BASE}/photos/${photoId}/view`;
  if (downloadBtn) downloadBtn.href = `${API_BASE}/photos/${photoId}/download`;
  if (modal) modal.style.display = 'flex';
}

function openLightboxDirect(photoId) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-image');
  const downloadBtn = document.getElementById('lightbox-download-btn');

  if (img) img.src = `${API_BASE}/photos/${photoId}/view`;
  if (downloadBtn) downloadBtn.href = `${API_BASE}/photos/${photoId}/download`;
  if (modal) modal.style.display = 'flex';
}

function closeLightbox() {
  const modal = document.getElementById('lightbox-modal');
  if (modal) modal.style.display = 'none';
}

function lightboxNav(direction) {
  if (!state.activeGalleryList || state.activeGalleryList.length === 0) return;
  let newIndex = state.lightboxIndex + direction;
  if (newIndex < 0) newIndex = state.activeGalleryList.length - 1;
  if (newIndex >= state.activeGalleryList.length) newIndex = 0;
  openLightboxIndex(newIndex);
}

function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightbox-modal');
    if (lb && lb.style.display === 'flex') {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lightboxNav(-1);
      if (e.key === 'ArrowRight') lightboxNav(1);
      return;
    }

    const sm = document.getElementById('selfie-modal');
    if (sm && sm.style.display === 'flex' && e.key === 'Escape') {
      closeSelfieModal();
    }
  });
}

/* ==========================================================================
   10. UTILITAIRES DIVERS
   ========================================================================== */
function copyToClipboard(text, notify = true) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (notify) {
    showToast(`Code "${text}" copié dans le presse-papier !`, "success", 2500);
  }
}

function setButtonLoading(button, isLoading, text) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${text || 'Chargement...'}`;
  } else {
    button.disabled = false;
    button.innerHTML = text || button.dataset.originalHtml || 'Valider';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}
