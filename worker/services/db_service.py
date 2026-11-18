import json
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import config

logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self):
        self.conn = None
        self._connect()

    def _connect(self):
        """Établit la connexion à PostgreSQL."""
        try:
            self.conn = psycopg2.connect(
                host=config.DB_HOST,
                port=config.DB_PORT,
                dbname=config.DB_NAME,
                user=config.DB_USER,
                password=config.DB_PASSWORD,
            )
            self.conn.autocommit = False
            logger.info(f"Connecté à PostgreSQL sur {config.DB_HOST}:{config.DB_PORT}/{config.DB_NAME}")
        except Exception as e:
            logger.error(f"Erreur de connexion à PostgreSQL: {e}")
            raise

    def _ensure_connection(self):
        """Vérifie la vivacité de la connexion et reconnecte au besoin."""
        if self.conn is None or self.conn.closed != 0:
            logger.warning("Connexion PostgreSQL fermée, tentative de reconnexion...")
            self._connect()

    def update_photo_status(self, photo_id: str, status: str):
        """Met à jour le statut de la photo dans la table photos."""
        self._ensure_connection()
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    "UPDATE photos SET status = %s WHERE id = %s;",
                    (status, photo_id)
                )
            self.conn.commit()
            logger.info(f"Statut de la photo {photo_id} mis à jour -> {status}")
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Erreur lors de la mise à jour du statut pour {photo_id}: {e}")
            raise

    def update_photo_processed(self, photo_id: str, thumbnail_key: str, width: int, height: int):
        """Met à jour la photo avec ses dimensions réelles, sa miniature et son statut PROCESSED."""
        self._ensure_connection()
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE photos 
                    SET thumbnail_key = %s, width = %s, height = %s, status = 'PROCESSED'
                    WHERE id = %s;
                    """,
                    (thumbnail_key, width, height, photo_id)
                )
            self.conn.commit()
            logger.info(f"Photo {photo_id} finalisée avec succès (statut PROCESSED).")
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Erreur lors de la finalisation de la photo {photo_id}: {e}")
            raise

    def insert_faces(self, photo_id: str, faces: list[dict]):
        """Insère les visages détectés dans la table faces avec leur embedding pgvector 512D."""
        if not faces:
            logger.info(f"Aucun visage à insérer pour la photo {photo_id}.")
            return

        self._ensure_connection()
        try:
            with self.conn.cursor() as cur:
                for face in faces:
                    embedding_str = "[" + ",".join(f"{v:.6f}" for v in face["embedding"]) + "]"
                    bbox_json = json.dumps(face["bounding_box"])
                    score = face["score"]

                    cur.execute(
                        """
                        INSERT INTO faces (photo_id, embedding, bounding_box, detection_score)
                        VALUES (%s, %s::vector, %s::jsonb, %s);
                        """,
                        (photo_id, embedding_str, bbox_json, score)
                    )
            self.conn.commit()
            logger.info(f"{len(faces)} visage(s) inséré(s) avec succès pour la photo {photo_id}.")
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Erreur lors de l'insertion des visages pour {photo_id}: {e}")
            raise

    def mark_photo_failed(self, photo_id: str):
        """Bascule la photo en statut FAILED en cas d'erreur de traitement."""
        try:
            self.update_photo_status(photo_id, "FAILED")
        except Exception as e:
            logger.error(f"Impossible de marquer la photo {photo_id} en FAILED: {e}")

    def close(self):
        if self.conn and not self.conn.closed:
            self.conn.close()
