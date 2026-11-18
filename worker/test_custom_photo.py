import io
import json
import os
import sys
import time
import uuid
from PIL import Image
import pika
from minio import Minio
import psycopg2
import config

def test_custom_photo(image_path: str):
    print("=" * 65)
    print("🚀 TEST DU WORKER IA AVEC VOTRE PROPRE PHOTO")
    print("=" * 65)

    if not os.path.exists(image_path):
        print(f"❌ Erreur : Le fichier image spécifié n'existe pas : {image_path}")
        sys.exit(1)

    # 1. Lecture et vérification de la photo locale
    print(f"\n[1/5] Lecture du fichier : {image_path}")
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    file_size_kb = round(len(img_bytes) / 1024, 2)
    print(f"   -> Taille du fichier : {file_size_kb} KB ({len(img_bytes)} octets)")

    try:
        with Image.open(io.BytesIO(img_bytes)) as pil_img:
            format_name = pil_img.format or "JPEG"
            width, height = pil_img.size
            print(f"   -> Format détecté : {format_name}, Résolution : {width}x{height} px")
    except Exception as e:
        print(f"❌ Erreur : Impossible de lire l'image ({e})")
        sys.exit(1)

    ext = os.path.splitext(image_path)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        content_type = "image/jpeg"
    elif ext == ".png":
        content_type = "image/png"
    elif ext == ".webp":
        content_type = "image/webp"
    else:
        content_type = "image/jpeg"

    # 2. Préparation en base PostgreSQL
    print("\n[2/5] Préparation de l'événement et de la photo dans PostgreSQL...")
    conn = psycopg2.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        dbname=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD
    )
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT id FROM users LIMIT 1;")
    user_row = cur.fetchone()
    if not user_row:
        user_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO users (id, email, password_hash, role) VALUES (%s, %s, 'hash', 'ROLE_PHOTOGRAPHER');",
            (user_id, "photographer@eventface.com")
        )
    else:
        user_id = user_row[0]

    event_id = str(uuid.uuid4())
    access_code = "EVT" + uuid.uuid4().hex[:3].upper()
    cur.execute(
        "INSERT INTO events (id, photographer_id, title, access_code, event_date) VALUES (%s, %s, 'Événement Test Utilisateur', %s, CURRENT_DATE);",
        (event_id, user_id, access_code)
    )

    photo_id = str(uuid.uuid4())
    original_key = f"events/{event_id}/original/{photo_id}{ext if ext else '.jpg'}"
    cur.execute(
        "INSERT INTO photos (id, event_id, original_key, status) VALUES (%s, %s, %s, 'PENDING');",
        (photo_id, event_id, original_key)
    )
    print(f"   -> Événement créé (ID: {event_id}, Code: {access_code})")
    print(f"   -> Photo enregistrée (ID: {photo_id}, Statut: PENDING)")

    # 3. Téléversement dans MinIO
    print(f"\n[3/5] Téléversement de l'image originale dans MinIO ({original_key})...")
    minio_client = Minio(
        endpoint=config.MINIO_ENDPOINT.replace("http://", "").replace("https://", ""),
        access_key=config.MINIO_ACCESS_KEY,
        secret_key=config.MINIO_SECRET_KEY,
        secure=config.MINIO_SECURE,
    )
    minio_client.put_object(
        bucket_name=config.MINIO_BUCKET,
        object_name=original_key,
        data=io.BytesIO(img_bytes),
        length=len(img_bytes),
        content_type=content_type
    )
    print(f"   -> Téléversement réussi dans le bucket '{config.MINIO_BUCKET}'.")

    # 4. Envoi du message dans RabbitMQ pour réveiller le Worker
    print("\n[4/5] Publication du message dans RabbitMQ (photo.process.queue)...")
    credentials = pika.PlainCredentials(config.RABBITMQ_USER, config.RABBITMQ_PASSWORD)
    connection = pika.BlockingConnection(pika.ConnectionParameters(
        host=config.RABBITMQ_HOST,
        port=config.RABBITMQ_PORT,
        credentials=credentials
    ))
    channel = connection.channel()

    message = {
        "photoId": photo_id,
        "eventId": event_id,
        "originalKey": original_key
    }
    channel.basic_publish(
        exchange=config.RABBITMQ_EXCHANGE,
        routing_key=config.RABBITMQ_ROUTING_KEY,
        body=json.dumps(message),
        properties=pika.BasicProperties(content_type="application/json")
    )
    connection.close()
    print(f"   -> Message AMQP expédié au Worker !")

    # 5. Attente du traitement asynchrone par l'IA
    print("\n[5/5] Analyse par le Worker IA en cours...")
    start_time = time.time()
    processed = False

    while time.time() - start_time < 25:
        cur.execute("SELECT status, thumbnail_key, width, height FROM photos WHERE id = %s;", (photo_id,))
        row = cur.fetchone()
        if row and row[0] == "PROCESSED":
            processed = True
            duration = round(time.time() - start_time, 2)
            print(f"   -> ✅ Traitement terminé avec succès en {duration}s !")
            print(f"      Dimensions enregistrées : {row[2]}x{row[3]} px")
            print(f"      Miniature créée : {row[1]}")
            break
        elif row and row[0] == "FAILED":
            print("   -> ❌ Le Worker a marqué la photo en FAILED.")
            break
        time.sleep(0.5)

    if not processed:
        print("   -> ❌ Délai dépassé (Timeout). Vérifiez les logs avec `docker logs eventface-worker`.")
        cur.close()
        conn.close()
        return

    # Récupération des visages détectés
    cur.execute(
        "SELECT id, bounding_box, detection_score, array_length(embedding::real[], 1) FROM faces WHERE photo_id = %s;",
        (photo_id,)
    )
    faces = cur.fetchall()

    print("\n" + "=" * 65)
    print(f"📊 RÉSULTAT DE L'INTELLIGENCE ARTIFICIELLE :")
    print("=" * 65)
    if not faces:
        print("⚠️ Aucun visage n'a été détecté sur cette photo (paysage, objet ou visage non visible).")
    else:
        print(f"🎉 {len(faces)} visage(s) détecté(s) avec succès !")
        for idx, f in enumerate(faces, 1):
            face_id = f[0]
            bbox = f[1]
            score = round(float(f[2]) * 100, 2) if f[2] else 0.0
            dim = f[3]
            print(f"\n   👤 Visage #{idx} :")
            print(f"      • Confiance IA    : {score}%")
            print(f"      • Bounding Box    : {bbox}")
            print(f"      • Empreinte 512D  : {dim} dimensions (stockée dans PostgreSQL pgvector)")

    cur.close()
    conn.close()
    print("\n" + "=" * 65)
    print("✨ TEST RÉUSSI AVEC VOTRE PHOTO !")
    print("=" * 65)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_custom_photo.py <chemin_image>")
        sys.exit(1)
    test_custom_photo(sys.argv[1])
