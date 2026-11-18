import os
from dotenv import load_dotenv

load_dotenv()

# RabbitMQ
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "rabbitmq")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "rabbitmqpassword")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "photo.process.queue")
RABBITMQ_EXCHANGE = os.getenv("RABBITMQ_EXCHANGE", "photo.exchange")
RABBITMQ_ROUTING_KEY = os.getenv("RABBITMQ_ROUTING_KEY", "photo.process.routingkey")

# MinIO
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadminpassword")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "photos")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() in ("true", "1", "yes")

# PostgreSQL
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5433"))
DB_NAME = os.getenv("DB_NAME", "eventface_db")
DB_USER = os.getenv("DB_USER", "eventface_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "eventface_password")

# Thumbnail
THUMBNAIL_MAX_WIDTH = int(os.getenv("THUMBNAIL_MAX_WIDTH", "800"))
THUMBNAIL_MAX_HEIGHT = int(os.getenv("THUMBNAIL_MAX_HEIGHT", "800"))
THUMBNAIL_QUALITY = int(os.getenv("THUMBNAIL_QUALITY", "85"))

# Face Recognition Model
FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_s")
FACE_DET_SCORE_THRESHOLD = float(os.getenv("FACE_DET_SCORE_THRESHOLD", "0.6"))
