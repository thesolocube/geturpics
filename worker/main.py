import json
import logging
import signal
import sys
import time
import pika
import config
from services.minio_service import MinioStorageService
from services.image_processor import ImageProcessor
from services.face_service import FaceEngine
from services.db_service import DatabaseService
from services.api_server import start_api_server

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("worker")

class PhotoProcessingWorker:
    def __init__(self):
        logger.info("Démarrage du worker EventFace de traitement d'images & IA...")
        self.minio_service = MinioStorageService()
        self.db_service = DatabaseService()
        self.face_engine = FaceEngine()
        self.connection = None
        self.channel = None
        self.is_running = True
        # Démarrage de l'API HTTP d'extraction d'embeddings pour la recherche par selfie
        self.http_server = start_api_server(self.face_engine, port=5001)

    def connect_rabbitmq(self):
        """Tente de se connecter à RabbitMQ avec réessais en cas d'échec."""
        credentials = pika.PlainCredentials(config.RABBITMQ_USER, config.RABBITMQ_PASSWORD)
        parameters = pika.ConnectionParameters(
            host=config.RABBITMQ_HOST,
            port=config.RABBITMQ_PORT,
            credentials=credentials,
            heartbeat=60,
            blocked_connection_timeout=300
        )

        while self.is_running:
            try:
                logger.info(f"Connexion à RabbitMQ sur {config.RABBITMQ_HOST}:{config.RABBITMQ_PORT}...")
                self.connection = pika.BlockingConnection(parameters)
                self.channel = self.connection.channel()

                # Déclaration durable de la file, de l'exchange et du binding
                self.channel.exchange_declare(
                    exchange=config.RABBITMQ_EXCHANGE,
                    exchange_type='topic',
                    durable=True
                )
                self.channel.queue_declare(
                    queue=config.RABBITMQ_QUEUE,
                    durable=True
                )
                self.channel.queue_bind(
                    exchange=config.RABBITMQ_EXCHANGE,
                    queue=config.RABBITMQ_QUEUE,
                    routing_key=config.RABBITMQ_ROUTING_KEY
                )

                # Traiter un seul message à la fois par instance de worker
                self.channel.basic_qos(prefetch_count=1)

                logger.info(f"Connecté avec succès à RabbitMQ. Écoute sur la file '{config.RABBITMQ_QUEUE}'...")
                return
            except pika.exceptions.AMQPConnectionError as e:
                logger.warning(f"Échec de connexion à RabbitMQ ({e}). Nouvelle tentative dans 5 secondes...")
                time.sleep(5)

    def process_photo_message(self, ch, method, properties, body):
        """Traite un message reçu depuis RabbitMQ."""
        photo_id = None
        event_id = None
        original_key = None

        try:
            payload = json.loads(body.decode("utf-8"))
            photo_id = payload.get("photoId")
            event_id = payload.get("eventId")
            original_key = payload.get("originalKey")

            if not photo_id or not event_id or not original_key:
                logger.error(f"Message invalide ignoré (champs manquants): {payload}")
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            logger.info(f"=== Début traitement photoId={photo_id} (eventId={event_id}) ===")

            # 1. Télécharger l'image originale depuis MinIO
            logger.info(f"[1/4] Téléchargement depuis MinIO: {original_key}")
            raw_image_bytes = self.minio_service.download_photo(original_key)

            # 2. Prétraitement et création de la miniature
            logger.info("[2/4] Génération de la miniature optimisée...")
            thumbnail_bytes, width, height = ImageProcessor.process_and_create_thumbnail(raw_image_bytes)
            thumbnail_key = f"events/{event_id}/thumbnails/{photo_id}.jpg"
            self.minio_service.upload_thumbnail(thumbnail_key, thumbnail_bytes)

            # 3. Détection et extraction des visages (Inférence IA)
            logger.info("[3/4] Détection faciale et calcul des embeddings 512D...")
            detected_faces = self.face_engine.extract_faces(raw_image_bytes)

            # 4. Enregistrement en base de données PostgreSQL / pgvector
            logger.info(f"[4/4] Sauvegarde des visages et mise à jour de la photo dans Postgres...")
            self.db_service.insert_faces(photo_id, detected_faces)
            self.db_service.update_photo_processed(photo_id, thumbnail_key, width, height)

            # Accusé de réception RabbitMQ
            ch.basic_ack(delivery_tag=method.delivery_tag)
            logger.info(f"=== Succès: photoId={photo_id} traitée avec {len(detected_faces)} visage(s) ===")

        except Exception as e:
            logger.error(f"Erreur lors du traitement de la photo {photo_id}: {e}", exc_info=True)
            if photo_id:
                self.db_service.mark_photo_failed(photo_id)
            # Acquitte le message pour éviter une boucle infinie de crash sur un message corrompu
            ch.basic_ack(delivery_tag=method.delivery_tag)

    def start(self):
        """Lance la boucle d'écoute principale."""
        while self.is_running:
            try:
                self.connect_rabbitmq()
                self.channel.basic_consume(
                    queue=config.RABBITMQ_QUEUE,
                    on_message_callback=self.process_photo_message
                )
                self.channel.start_consuming()
            except pika.exceptions.ConnectionClosedByBroker:
                logger.warning("Connexion fermée par le broker RabbitMQ, reconnexion...")
                continue
            except pika.exceptions.AMQPChannelError as e:
                logger.error(f"Erreur de canal AMQP: {e}, reconnexion...")
                continue
            except Exception as e:
                if self.is_running:
                    logger.error(f"Exception inattendue dans la boucle du worker: {e}, reconnexion dans 5s...")
                    time.sleep(5)
                else:
                    break

    def stop(self):
        """Arrête proprement le worker."""
        logger.info("Signal d'arrêt reçu, fermeture du worker...")
        self.is_running = False
        try:
            if hasattr(self, 'http_server') and self.http_server:
                self.http_server.shutdown()
            if self.channel and self.channel.is_open:
                self.channel.stop_consuming()
            if self.connection and self.connection.is_open:
                self.connection.close()
            self.db_service.close()
        except Exception as e:
            logger.warning(f"Erreur lors de la fermeture des connexions: {e}")
        logger.info("Worker arrêté proprement.")

if __name__ == "__main__":
    worker = PhotoProcessingWorker()

    def signal_handler(signum, frame):
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    worker.start()
