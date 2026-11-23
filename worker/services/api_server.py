import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

logger = logging.getLogger("worker.api")

class EmbeddingRequestHandler(BaseHTTPRequestHandler):
    face_engine = None

    def log_message(self, format, *args):
        # Utiliser le logger standard au lieu d'écrire sur stderr
        logger.info(f"{self.address_string()} - {format % args}")

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"UP","service":"worker-ai"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/embed":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length == 0:
                    self._send_json(400, {"error": "Corps de la requête vide"})
                    return

                body = self.rfile.read(content_length)

                # Si les données arrivent sous forme multipart/form-data, extraire les octets bruts de l'image
                content_type = self.headers.get("Content-Type", "")
                image_bytes = self._extract_image_bytes(body, content_type)

                if not image_bytes:
                    self._send_json(400, {"error": "Impossible d'extraire l'image"})
                    return

                # Inférence par l'IA InsightFace
                faces = self.face_engine.extract_faces(image_bytes)

                response_data = {
                    "count": len(faces),
                    "faces": faces
                }
                self._send_json(200, response_data)

            except Exception as e:
                logger.error(f"Erreur lors de l'extraction des embeddings: {e}", exc_info=True)
                self._send_json(500, {"error": str(e)})
        else:
            self.send_response(404)
            self.end_headers()

    def _send_json(self, status_code: int, data: dict):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _extract_image_bytes(self, body: bytes, content_type: str) -> bytes:
        if "multipart/form-data" in content_type and "boundary=" in content_type:
            boundary = content_type.split("boundary=")[1].strip()
            # Supprimer les guillemets si présents
            boundary = boundary.strip('"')
            parts = body.split(b"--" + boundary.encode("utf-8"))
            for part in parts:
                if b"Content-Disposition" in part:
                    header_and_data = part.split(b"\r\n\r\n", 1)
                    if len(header_and_data) == 2:
                        data = header_and_data[1]
                        # Retirer le saut de ligne de fin avant le prochain boundary
                        if data.endswith(b"\r\n"):
                            data = data[:-2]
                        return data
        # Sinon, traiter directement les octets reçus (ex: application/octet-stream ou raw image)
        return body

def start_api_server(face_engine, port=5001):
    EmbeddingRequestHandler.face_engine = face_engine
    server = HTTPServer(("0.0.0.0", port), EmbeddingRequestHandler)
    logger.info(f"Serveur HTTP d'extraction d'embeddings IA démarré sur le port {port}...")
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    return server
