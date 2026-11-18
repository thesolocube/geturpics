import io
import logging
from minio import Minio
from minio.error import S3Error
import config

logger = logging.getLogger(__name__)

class MinioStorageService:
    def __init__(self):
        # Enleve le prefixe http:// ou https:// si present dans MINIO_ENDPOINT
        endpoint = config.MINIO_ENDPOINT.replace("http://", "").replace("https://", "")
        self.client = Minio(
            endpoint=endpoint,
            access_key=config.MINIO_ACCESS_KEY,
            secret_key=config.MINIO_SECRET_KEY,
            secure=config.MINIO_SECURE,
        )
        self.bucket = config.MINIO_BUCKET
        self.ensure_bucket_exists()

    def ensure_bucket_exists(self):
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
                logger.info(f"Bucket '{self.bucket}' créé avec succès sur MinIO.")
        except S3Error as e:
            logger.error(f"Erreur lors de la vérification du bucket MinIO: {e}")
            raise

    def download_photo(self, object_key: str) -> bytes:
        """Télécharge l'image originale depuis MinIO et renvoie les octets bruts."""
        response = None
        try:
            response = self.client.get_object(self.bucket, object_key)
            data = response.read()
            logger.info(f"Photo téléchargée avec succès depuis MinIO: {object_key} ({len(data)} octets)")
            return data
        except S3Error as e:
            logger.error(f"Erreur S3 lors du téléchargement de '{object_key}': {e}")
            raise
        finally:
            if response:
                response.close()
                response.release_conn()

    def upload_thumbnail(self, thumbnail_key: str, data: bytes, content_type: str = "image/jpeg") -> str:
        """Téléverse la miniature dans MinIO."""
        try:
            data_stream = io.BytesIO(data)
            self.client.put_object(
                bucket_name=self.bucket,
                object_name=thumbnail_key,
                data=data_stream,
                length=len(data),
                content_type=content_type,
            )
            logger.info(f"Miniature téléversée avec succès dans MinIO: {thumbnail_key}")
            return thumbnail_key
        except S3Error as e:
            logger.error(f"Erreur S3 lors de l'upload de la miniature '{thumbnail_key}': {e}")
            raise
