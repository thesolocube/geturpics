/**
 * EventFace - Frontend Application Logic
 */

// Si l'application tourne sur le même hôte (ex: Spring Boot statique ou reverse proxy), utiliser l'URL relative
const API_BASE = window.location.port === "8081" 
  ? "/api/v1" 
  : "http://localhost:8081/api/v1";

// State Global
const state = {
  currentTab: 'guest', // 'photographer' ou 'guest'
  events: [],
  selectedEvent: null,
  photos: [],
  selectedPhotoIds: new Set(),
  searchResults: null,
  isSearching: false,
  lightboxPhoto: null,
  lightboxIndex: 0,
  webcamStream: null,
  activeGalleryList: []
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  checkApiHealth();
  setupPhotographerForms();
  setupGuestSearch();
  setupDropzone();

  // Charger les événements existants
  loadEvents();
});

/* ==========================================================================
   1. GESTION DES ONGLETS & NAVIGATION
   ========================================================================== */
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      state.currentTab = tabName;

      document.getElementById('photographer-view').style.display = (tabName === 'photographer') ? 'block' : 'none';
      document.getElementById('guest-view').style.display = (tabName === 'guest') ? 'block' : 'none';

      if (tabName === 'photographer') {
        loadEvents();
      }
    });
  });
}

async function checkApiHealth() {
  const statusEl = document.getElementById('api-status');
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (res.ok) {
      statusEl.innerHTML = `<span class="status-dot"></span> Backend & IA Connectés`;
    } else {
      statusEl.innerHTML = `<span class="status-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span> API Réponse HTTP ${res.status}`;
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></span> Hors ligne (port 8081)`;
  }
}

/* ==========================================================================
   2. ESPACE PHOTOGRAPHE
   ========================================================================== */
function setupPhotographerForms() {
  const createForm = document.getElementById('create-event-form');
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('event-title').value.trim();
    const eventDate = document.getElementById('event-date').value;
    const description = document.getElementById('event-description').value.trim();

    if (!title || !eventDate) return;

    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photographerId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", // ID par défaut
          title,
          eventDate,
          description
        })
      });

      if (!res.ok) throw new Error("Échec de la création de l'événement");
      const newEvent = await res.json();
      
      alert(`🎉 Événement "${newEvent.title}" créé avec succès !\nCode d'accès invité : ${newEvent.accessCode}`);
      createForm.reset();
      await loadEvents();
      selectPhotographerEvent(newEvent.id);
    } catch (err) {
      alert("Erreur: " + err.message);
    }
  });
}

async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) return;
    state.events = await res.json();
    renderEventsList();
    renderGuestRecentEvents();
  } catch (err) {
    console.error("Erreur chargement événements:", err);
  }
}

function renderEventsList() {
  const grid = document.getElementById('photographer-events-grid');
  if (!grid) return;

  if (state.events.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">Aucun événement créé pour le moment. Créez-en un ci-dessus !</p>`;
    return;
  }

  grid.innerHTML = state.events.map(evt => `
    <div class="event-card">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
          <h3 style="font-size:1.15rem; font-weight:700;">${escapeHtml(evt.title)}</h3>
          <span class="event-code-badge" title="Cliquez pour copier" onclick="copyToClipboard('${evt.accessCode}')">
            🔑 ${evt.accessCode}
          </span>
        </div>
        <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:0.75rem;">
          📅 ${evt.eventDate}
        </p>
        <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.4;">
          ${escapeHtml(evt.description || 'Aucune description')}
        </p>
      </div>
      <div style="margin-top:1.25rem; display:flex; gap:0.5rem;">
        <button class="btn btn-primary btn-sm" onclick="selectPhotographerEvent('${evt.id}')">
          📷 Gérer / Uploader
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
  document.getElementById('manage-event-section').style.display = 'block';
  document.getElementById('manage-event-title').innerText = evt.title;
  document.getElementById('manage-event-code').innerText = evt.accessCode;

  // Défiler jusqu'à la section
  document.getElementById('manage-event-section').scrollIntoView({ behavior: 'smooth' });

  await loadPhotographerPhotos(eventId);
}

async function loadPhotographerPhotos(eventId) {
  try {
    const res = await fetch(`${API_BASE}/photos/events/${eventId}`);
    if (!res.ok) return;
    const photos = await res.json();
    renderPhotographerPhotos(photos);
  } catch (err) {
    console.error("Erreur chargement photos photographe:", err);
  }
}

function renderPhotographerPhotos(photos) {
  const grid = document.getElementById('photographer-photos-grid');
  document.getElementById('photographer-photo-count').innerText = `${photos.length} photo(s)`;

  if (photos.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">Aucune photo dans cet album. Glissez-en dans la zone de dépôt ci-dessus !</p>`;
    return;
  }

  grid.innerHTML = photos.map(p => `
    <div class="photo-item" onclick="openLightboxDirect('${p.id}', '${escapeHtml(p.originalKey)}')">
      <img class="photo-img" src="${API_BASE}/photos/${p.id}/thumbnail" loading="lazy" alt="Photo" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23334155\\'/></svg>'"/>
      <div class="photo-overlay">
        <div>
          <span style="background:rgba(0,0,0,0.6); padding:2px 8px; border-radius:4px; font-size:0.75rem;">
            ${p.width || '?'}x${p.height || '?'} px
          </span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.75rem; color:#10b981;">✅ Traité</span>
          <a href="${API_BASE}/photos/${p.id}/download" class="btn btn-secondary btn-sm" onclick="event.stopPropagation();" download>⬇️</a>
        </div>
      </div>
    </div>
  `).join('');
}

/* --- DRAG & DROP & UPLOAD DIRECT VERS MINIO --- */
function setupDropzone() {
  const dropzone = document.getElementById('photo-dropzone');
  const fileInput = document.getElementById('photo-file-input');

  dropzone.addEventListener('click', () => fileInput.click());

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
    alert("Veuillez d'abord sélectionner ou créer un événement.");
    return;
  }

  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) {
    alert("Veuillez sélectionner des images (JPEG, PNG).");
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
      // 1. Négociation de l'URL pré-signée PUT
      const urlRes = await fetch(`${API_BASE}/photos/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: state.selectedEvent.id,
          filename: file.name
        })
      });

      if (!urlRes.ok) throw new Error("Erreur obtention URL pré-signée");
      const { photoId, uploadUrl } = await urlRes.json();

      // Ajustement de l'URL d'upload si MinIO est dans Docker et l'utilisateur est sur l'hôte
      let directUploadUrl = uploadUrl;
      if (directUploadUrl.includes("http://minio:9000")) {
        directUploadUrl = directUploadUrl.replace("http://minio:9000", "http://localhost:9000");
      }

      // 2. Téléversement PUT binaire direct vers MinIO
      const putRes = await fetch(directUploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file
      });

      if (!putRes.ok) throw new Error("Échec upload binaire vers MinIO");

      // 3. Confirmation auprès du backend Spring Boot (déclenche RabbitMQ -> Worker IA)
      await fetch(`${API_BASE}/photos/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoId: photoId
        })
      });

      completed++;
      const percent = Math.round((completed / files.length) * 100);
      progressBar.style.width = `${percent}%`;
    } catch (err) {
      console.error(`Erreur upload pour ${file.name}:`, err);
    }
  }

  progressText.innerText = `✅ ${completed} photo(s) envoyée(s) ! Traitement par l'IA en cours...`;
  setTimeout(() => {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
  }, 4000);

  // Rafraîchir les photos de l'album après 3 secondes (temps que le worker traite)
  setTimeout(() => loadPhotographerPhotos(state.selectedEvent.id), 3000);
}

/* ==========================================================================
   3. ESPACE INVITÉ
   ========================================================================== */
function setupGuestSearch() {
  const codeForm = document.getElementById('guest-code-form');
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('guest-code-input').value.trim();
    if (!code) return;
    await openGuestEvent(code);
  });
}

function renderGuestRecentEvents() {
  const container = document.getElementById('guest-recent-events');
  if (!container) return;

  if (state.events.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:0.5rem;">Ou choisissez un événement récent :</p>
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
      ${state.events.slice(0, 5).map(e => `
        <button class="btn btn-secondary btn-sm" onclick="openGuestEvent('${e.accessCode}')">
          ${escapeHtml(e.title)} (${e.accessCode})
        </button>
      `).join('')}
    </div>
  `;
}

async function openGuestEvent(accessCode) {
  try {
    const res = await fetch(`${API_BASE}/events/access?code=${encodeURIComponent(accessCode)}`);
    if (!res.ok) {
      alert("Code d'accès invalide. Vérifiez auprès du photographe.");
      return;
    }

    const eventData = await res.json();
    state.selectedEvent = eventData;
    state.searchResults = null; // reset search

    // Basculer sur l'onglet invité si on venait du photographe
    const guestTab = document.querySelector('.nav-tab[data-tab="guest"]');
    if (guestTab) guestTab.click();

    document.getElementById('guest-welcome-screen').style.display = 'none';
    document.getElementById('guest-gallery-screen').style.display = 'block';

    document.getElementById('guest-event-title').innerText = eventData.title;
    document.getElementById('guest-event-date').innerText = `📅 ${eventData.eventDate}`;
    document.getElementById('guest-event-code').innerText = eventData.accessCode;

    await loadGuestGallery(eventData.id);
  } catch (err) {
    alert("Erreur de connexion : " + err.message);
  }
}

async function loadGuestGallery(eventId) {
  try {
    const res = await fetch(`${API_BASE}/photos/events/${eventId}`);
    if (!res.ok) return;
    state.photos = await res.json();
    state.activeGalleryList = state.photos;
    state.selectedPhotoIds.clear();
    updateSelectionBar();
    renderGuestGallery(state.photos);
  } catch (err) {
    console.error("Erreur chargement galerie invité:", err);
  }
}

function renderGuestGallery(photos, isSearchResult = false) {
  const grid = document.getElementById('guest-photos-grid');
  document.getElementById('guest-photo-counter').innerText = `${photos.length} photo(s)`;

  if (photos.length === 0) {
    if (isSearchResult) {
      grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:3rem;">
          <p style="font-size:2.5rem; margin-bottom:1rem;">🔍</p>
          <h3 style="font-size:1.2rem; margin-bottom:0.5rem;">Aucune photo trouvée avec ce visage</h3>
          <p style="color:var(--text-muted); font-size:0.9rem;">Essayez avec un autre selfie sous un meilleur éclairage ou diminuez le seuil de sensibilité.</p>
          <button class="btn btn-secondary" style="margin-top:1rem;" onclick="resetGuestSearch()">Voir toutes les photos</button>
        </div>
      `;
    } else {
      grid.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">Aucune photo n'est encore disponible pour cet événement.</p>`;
    }
    return;
  }

  grid.innerHTML = photos.map((p, idx) => {
    const photoId = p.photoId || p.id;
    const isSelected = state.selectedPhotoIds.has(photoId);
    const matchBadge = p.similarity 
      ? `<span class="photo-match-badge">🎯 ${p.similarity}% match</span>` 
      : '';

    return `
      <div class="photo-item" onclick="openLightboxIndex(${idx})">
        <img class="photo-img" src="${API_BASE}/photos/${photoId}/thumbnail" loading="lazy" alt="Photo"/>
        ${matchBadge}
        <div class="photo-overlay">
          <input type="checkbox" class="photo-checkbox" ${isSelected ? 'checked' : ''} 
                 onclick="togglePhotoSelection('${photoId}', event)"/>
          <div style="display:flex; justify-content:flex-end;">
            <a href="${API_BASE}/photos/${photoId}/download" class="btn btn-secondary btn-sm" onclick="event.stopPropagation();" download>
              ⬇️
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
}

function resetGuestSearch() {
  state.searchResults = null;
  state.activeGalleryList = state.photos;
  document.getElementById('search-filter-banner').style.display = 'none';
  renderGuestGallery(state.photos);
}

/* ==========================================================================
   4. RECHERCHE FACIALE PAR SELFIE (MODULE IA)
   ========================================================================== */
function openSelfieModal() {
  document.getElementById('selfie-modal').style.display = 'flex';
  switchSelfieMode('upload');
}

function closeSelfieModal() {
  stopWebcam();
  document.getElementById('selfie-modal').style.display = 'none';
}

function switchSelfieMode(mode) {
  document.getElementById('selfie-upload-pane').style.display = (mode === 'upload') ? 'block' : 'none';
  document.getElementById('selfie-camera-pane').style.display = (mode === 'camera') ? 'block' : 'none';

  if (mode === 'camera') {
    startWebcam();
  } else {
    stopWebcam();
  }
}

async function startWebcam() {
  const video = document.getElementById('webcam-video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } });
    state.webcamStream = stream;
    video.srcObject = stream;
    video.play();
  } catch (err) {
    alert("Impossible d'accéder à la webcam : " + err.message);
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
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    executeSelfieSearch(blob);
  }, 'image/jpeg', 0.95);
}

function handleSelfieFileSelected(input) {
  if (input.files && input.files[0]) {
    executeSelfieSearch(input.files[0]);
  }
}

async function executeSelfieSearch(fileOrBlob) {
  if (!state.selectedEvent) return;

  const threshold = document.getElementById('selfie-threshold').value || "0.45";
  const scanningOverlay = document.getElementById('selfie-scanning-overlay');
  scanningOverlay.style.display = 'flex';

  const formData = new FormData();
  formData.append('selfie', fileOrBlob, 'selfie.jpg');
  formData.append('threshold', threshold);

  try {
    const res = await fetch(`${API_BASE}/photos/events/${state.selectedEvent.id}/search-by-selfie`, {
      method: 'POST',
      body: formData
    });

    scanningOverlay.style.display = 'none';
    closeSelfieModal();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.message || "Erreur lors de la recherche faciale.");
      return;
    }

    const matches = await res.json();
    state.searchResults = matches;
    state.activeGalleryList = matches;

    // Afficher la bannière de résultats
    document.getElementById('search-filter-banner').style.display = 'flex';
    document.getElementById('search-matches-text').innerText = `✨ ${matches.length} photo(s) où vous apparaissez !`;

    renderGuestGallery(matches, true);
  } catch (err) {
    scanningOverlay.style.display = 'none';
    alert("Erreur de connexion lors de la recherche : " + err.message);
  }
}

/* ==========================================================================
   5. SÉLECTION ET TÉLÉCHARGEMENT ZIP
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
  const count = state.selectedPhotoIds.size;
  document.getElementById('selected-count-label').innerText = `${count} sélectionnée(s)`;

  if (count > 0) {
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}

async function downloadSelectedZip() {
  if (!state.selectedEvent || state.selectedPhotoIds.size === 0) return;

  const btn = document.getElementById('btn-download-selected');
  const oldText = btn.innerHTML;
  btn.innerHTML = `⏳ Préparation du ZIP...`;
  btn.disabled = true;

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
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `selection_${state.selectedEvent.accessCode}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    alert("Erreur lors du téléchargement : " + err.message);
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

function downloadAllZip() {
  if (!state.selectedEvent) return;
  window.location.href = `${API_BASE}/photos/events/${state.selectedEvent.id}/download-zip`;
}

/* ==========================================================================
   6. VISIONNEUSE PLEIN ÉCRAN (LIGHTBOX)
   ========================================================================== */
function openLightboxIndex(index) {
  if (!state.activeGalleryList || index < 0 || index >= state.activeGalleryList.length) return;
  state.lightboxIndex = index;
  const photo = state.activeGalleryList[index];
  const photoId = photo.photoId || photo.id;

  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-image');
  const downloadBtn = document.getElementById('lightbox-download-btn');

  img.src = `${API_BASE}/photos/${photoId}/view`;
  downloadBtn.href = `${API_BASE}/photos/${photoId}/download`;
  modal.style.display = 'flex';
}

function openLightboxDirect(photoId, key) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-image');
  const downloadBtn = document.getElementById('lightbox-download-btn');

  img.src = `${API_BASE}/photos/${photoId}/view`;
  downloadBtn.href = `${API_BASE}/photos/${photoId}/download`;
  modal.style.display = 'flex';
}

function closeLightbox() {
  document.getElementById('lightbox-modal').style.display = 'none';
}

function lightboxNav(direction) {
  if (!state.activeGalleryList || state.activeGalleryList.length === 0) return;
  let newIndex = state.lightboxIndex + direction;
  if (newIndex < 0) newIndex = state.activeGalleryList.length - 1;
  if (newIndex >= state.activeGalleryList.length) newIndex = 0;
  openLightboxIndex(newIndex);
}

// Raccourcis clavier pour la lightbox
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('lightbox-modal');
  if (modal && modal.style.display === 'flex') {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
  }
});

/* ==========================================================================
   7. UTILITAIRES
   ========================================================================== */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  alert(`Code "${text}" copié dans le presse-papier !`);
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
