# 📸 EventFace (`geturpics`)

Plateforme événementielle de gestion et de distribution intelligente de photos par **reconnaissance faciale IA** et **recherche vectorielle**.

---

## 🌟 Fonctionnalités Clés

1. **Espace Photographe :**
   - Création d'événements avec génération automatique de **codes d'accès uniques** (ex: `GALA26`).
   - Téléversement direct en masse (Drag & Drop) de photos haute résolution vers le stockage objet MinIO.
   - Suivi en temps réel du traitement IA des albums.

2. **Worker IA Asynchrone :**
   - Consommation asynchrone découplée via **RabbitMQ** (`photo.process.queue`).
   - Correction automatique de l'orientation EXIF et génération de miniatures optimisées (thumbnails).
   - Détection des visages et calcul d'empreintes biométriques (embeddings 512D) avec **InsightFace (ArcFace)**.
   - Stockage et indexation vectorielle HNSW dans **PostgreSQL / pgvector**.

3. **Espace Invité :**
   - Accès sécurisé par code d'invitation sans création de compte obligatoire.
   - Galerie photo responsive avec affichage fluide des miniatures et visionneuse plein écran (Lightbox HD).
   - **Recherche par Selfie (IA)** : L'invité prend un selfie via sa webcam ou importe une photo ; l'IA compare son visage avec la base de données et isole ses photos en quelques millisecondes !
   - **Téléchargement ZIP** : Téléchargement en 1 clic de tout l'album ou uniquement de ses photos sélectionnées.

---

## 🏗️ Architecture Technique

```
                              ┌──────────────────────────────────┐
                              │     Frontend Web (Port 3000)     │
                              │       Espace Invité & Photo      │
                              └─────────────────┬────────────────┘
                                                │ HTTP REST / Upload
                                                ▼
┌───────────────────────┐            ┌──────────────────────────────────┐
│ MinIO S3 (Port 9000)  │◄───────────┤   Backend Spring Boot 3.3.5      │
│   Bucket photos       │            │        (Port 8081 / Java 17)     │
└──────────▲────────────┘            └──────────┬──────────────┬────────┘
           │                                    │              │
           │                                    │ Message AMQP │ SQL Vector
           │                                    ▼              ▼
           │                         ┌────────────────┐ ┌────────────────┐
           │                         │  RabbitMQ      │ │  PostgreSQL 16 │
           │                         │  (Port 5672)   │ │  + pgvector    │
           │                         └────────┬───────┘ │  (Port 5433)   │
           │                                  │         └───────▲────────┘
           │                                  │ Consomme        │
           │                                  ▼                 │
           │                         ┌────────────────┐         │ Insère visages
           └─────────────────────────┤   Worker IA    ├─────────┘
                                     │   (Python 3.11)│
                                     │  InsightFace   │
                                     └────────────────┘
```

---

## 🚀 Démarrage Rapide

### 1. Prérequis
- [Docker Desktop](https://www.docker.com/) installé et démarré.

### 2. Lancer l'ensemble de la plateforme
À la racine du projet :
```powershell
docker compose up -d --build
```

### 3. Accéder aux interfaces
| Service | URL | Identifiants |
| :--- | :--- | :--- |
| **Interface Web (Frontend)** | **http://localhost:3000** ou **http://localhost:8081** | Accès libre |
| **Backend API (Swagger/REST)** | **http://localhost:8081/api/v1/events** | - |
| **RabbitMQ Management** | **http://localhost:15672** | `rabbitmq` / `rabbitmqpassword` |
| **MinIO Console S3** | **http://localhost:9001** | `minioadmin` / `minioadminpassword` |
| **PostgreSQL pgvector** | `localhost:5433` | `eventface_user` / `eventface_password` (db: `eventface_db`) |

---

## 🧪 Tester le projet avec une photo de votre PC

Un script d'aide est disponible à la racine :
```powershell
.\test-photo.ps1 "C:\chemin\vers\votre_photo.jpg"
```
Ce script copie la photo, l'envoie dans MinIO, déclenche l'IA et affiche les résultats de détection directement dans votre console !
