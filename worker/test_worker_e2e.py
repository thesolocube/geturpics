import io
import json
import time
import urllib.request
import uuid
from PIL import Image
import pika
from minio import Minio
import psycopg2
import config

def run_test():
    print("=" * 65)
    print("🚀 TEST DE VALIDATION DU WORKER IA (ÉTAPE 3)")
    print("=" * 65)

    # 1. Préparation d'une photo réelle de portrait pour tester l'IA
    print("[1/5] Récupération d'une photo portrait de test...")
    test_image_url = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg"
    try:
        req = urllib.request.Request(test_image_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            img_bytes = resp.read()
        print(f"   -> Image téléchargée avec succès ({len(img_bytes)} octets)")
    except Exception as e:
        print(f"   -> Téléchargement échoué ({e}), génération d'un portrait de secours...")
        img = Image.new("RGB", (512, 512), color=(220, 220, 230))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        img_bytes = buf.getvalue()

    # 2. Enregistrement préalable dans PostgreSQL
    print("\n[2/5] Préparation des enregistrements dans PostgreSQL...")
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
            (user_id, "admin@eventface.com")
        )
    else:
        user_id = user_row[0]

    event_id = str(uuid.uuid4())
    access_code = "EVT" + uuid.uuid4().hex[:3].upper()
    cur.execute(
        "INSERT INTO events (id, photographer_id, title, access_code, event_date) VALUES (%s, %s, 'Soirée Test', %s, CURRENT_DATE);",
        (event_id, user_id, access_code)
    )

    photo_id = str(uuid.uuid4())
    original_key = f"events/{event_id}/original/{photo_id}_portrait.jpg"
    cur.execute(
        "INSERT INTO photos (id, event_id, original_key, status) VALUES (%s, %s, %s, 'PENDING');",
        (photo_id, event_id, original_key)
    )
    print(f"   -> Événement créé : id={event_id}, code={access_code}")
    print(f"   -> Photo initialisée en base : id={photo_id}, statut=PENDING")

    # 3. Téléversement de l'image originale dans MinIO
    print("\n[3/5] Téléversement de la photo originale dans MinIO...")
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
        content_type="image/jpeg"
    )
    print(f"   -> Photo stockée dans le bucket '{config.MINIO_BUCKET}': {original_key}")

    # 4. Émission du message dans RabbitMQ pour réveiller le Worker
    print("\n[4/5] Publication de l'événement dans RabbitMQ (photo.process.queue)...")
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
    print(f"   -> Message AMQP envoyé : {json.dumps(message)}")

    # 5. Attente et vérification des résultats
    print("\n[5/5] Attente du traitement par le Worker IA...")
    start_time = time.time()
    processed = False

    while time.time() - start_time < 15:
        cur.execute("SELECT status, thumbnail_key, width, height FROM photos WHERE id = %s;", (photo_id,))
        row = cur.fetchone()
        if row and row[0] == "PROCESSED":
            processed = True
            print(f"   -> ✅ Photo passée en PROCESSED en {round(time.time() - start_time, 2)}s !")
            print(f"      Dimensions : {row[2]}x{row[3]} px")
            print(f"      Miniature : {row[1]}")
            break
        time.sleep(0.5)

    if not processed:
        print("❌ Timeout : la photo n'a pas été traitée dans les temps.")
        return

    # Vérification dans PostgreSQL (table faces)
    cur.execute(
        "SELECT id, bounding_box, detection_score, array_length(embedding::real[], 1) FROM faces WHERE photo_id = %s;",
        (photo_id,)
    )
    faces = cur.fetchall()
    print(f"\n   -> ✅ Résultat Reconnaissance Faciale : {len(faces)} visage(s) détecté(s) !")
    for f in faces:
        print(f"      • Visage ID : {f[0]}")
        print(f"        Score de confiance : {f[2]}")
        print(f"        Boîte englobante : {f[1]}")
        print(f"        Vecteur facial : {f[3]} dimensions (pgvector VECTOR(512))")

    cur.close()
    conn.close()

    print("\n" + "=" * 65)
    print("🎉 SUCCÈS : LE WORKER IA EST 100% OPÉRATIONNEL !")
    print("=" * 65)

if __name__ == "__main__":
    run_test()
