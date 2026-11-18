import io
import logging
from PIL import Image, ImageOps
import config

logger = logging.getLogger(__name__)

class ImageProcessor:
    @staticmethod
    def process_and_create_thumbnail(image_bytes: bytes) -> tuple[bytes, int, int]:
        """
        Ouvre l'image, corrige son orientation EXIF, extrait ses dimensions
        originales et génère une vignette compressée (JPEG).
        
        Retourne : (thumbnail_bytes, original_width, original_height)
        """
        with Image.open(io.BytesIO(image_bytes)) as img:
            # Corrige l'orientation EXIF des appareils photo numériques et smartphones
            img = ImageOps.exif_transpose(img)
            
            # Convertit en RGB si l'image est en RGBA (ex: PNG avec transparence) ou CMYK
            if img.mode != "RGB":
                img = img.convert("RGB")

            width, height = img.size

            # Création de la miniature
            thumb = img.copy()
            thumb.thumbnail(
                (config.THUMBNAIL_MAX_WIDTH, config.THUMBNAIL_MAX_HEIGHT),
                Image.Resampling.LANCZOS
            )

            thumb_io = io.BytesIO()
            thumb.save(
                thumb_io,
                format="JPEG",
                quality=config.THUMBNAIL_QUALITY,
                optimize=True
            )
            thumbnail_bytes = thumb_io.getvalue()

            logger.info(
                f"Image traitée: dimensions originales {width}x{height}, "
                f"miniature générée: {thumb.size[0]}x{thumb.size[1]} ({len(thumbnail_bytes)} octets)"
            )

            return thumbnail_bytes, width, height
