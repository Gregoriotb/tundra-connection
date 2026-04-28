"""Sanitización de contenido controlado por usuarios.

Spec:
- Orquestor.md §FASE 5 (R6 del checklist de seguridad: "Sanitizé HTML
  en contenido de usuario? (chat, tickets)")
- SECURITY_RULES.md — defensa contra XSS

Estrategia:
- El frontend renderiza el `content` como TEXTO PLANO (React `{...}`
  escapa por defecto), por lo que la primera línea de defensa ya
  bloquea inyección. Aún así sanitizamos al GUARDAR para:
    1. Defensa en profundidad (si algún día se renderiza como HTML).
    2. Pulir el content (trim, colapsar espacios excesivos, recortar a
       límites razonables).
    3. Bloquear caracteres de control que rompen WS/JSON.

NO usamos `bleach` u otras libs HTML porque NO interpretamos HTML.
El producto es chat de texto plano.
"""

from __future__ import annotations

import re
import unicodedata

# Caracteres de control (excepto \n, \t, \r) que NO deben aparecer en
# texto de usuario. Vienen en categoría "Cc" de Unicode.
_CONTROL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")

# Espacios duplicados internos (3+ → 2). Mantiene saltos de línea.
_MULTIPLE_SPACES = re.compile(r"[ \t]{3,}")

# Más de 5 newlines seguidos → 5.
_MULTIPLE_NEWLINES = re.compile(r"\n{6,}")

# Etiquetas <script>...</script> o <iframe>...</iframe> y similares —
# por si alguien intenta poner el chat en HTML accidentalmente.
_DANGEROUS_TAGS = re.compile(
    r"<\s*(?:script|iframe|object|embed|svg|style|link|meta)[^>]*>",
    re.IGNORECASE,
)


def sanitize_user_text(
    raw: str,
    *,
    max_length: int = 4000,
    collapse_whitespace: bool = True,
) -> str:
    """Limpia texto controlado por el usuario.

    Operaciones:
      1. Normaliza Unicode a NFC (forma compuesta canónica).
      2. Elimina caracteres de control (excepto \\n, \\t, \\r).
      3. Strip de extremos.
      4. Si `collapse_whitespace`, reduce series de espacios largas y
         saltos de línea excesivos.
      5. Bloquea apariencias de tags peligrosos (defensa en profundidad).
      6. Trunca a `max_length` (con elipsis si excede).

    NO escapa HTML. El frontend lo renderiza como texto plano.
    """
    if not raw:
        return ""

    text = unicodedata.normalize("NFC", raw)
    text = _CONTROL_RE.sub("", text)

    if collapse_whitespace:
        text = _MULTIPLE_SPACES.sub("  ", text)
        text = _MULTIPLE_NEWLINES.sub("\n\n\n\n\n", text)

    text = _DANGEROUS_TAGS.sub("[bloqueado]", text)
    text = text.strip()

    if len(text) > max_length:
        text = text[: max_length - 1].rstrip() + "…"

    return text


def sanitize_filename(name: str, *, max_length: int = 200) -> str:
    """Sanitiza nombres de archivo para almacenarlos en JSONB.

    No los usamos para escribir en filesystem (eso lo hace ImgBB) pero
    sí queremos un nombre humano-legible y libre de caracteres raros.
    """
    if not name:
        return "archivo"
    text = unicodedata.normalize("NFC", name)
    text = _CONTROL_RE.sub("", text)
    # Reemplaza separadores de path por "-" para evitar confusión visual.
    text = text.replace("\\", "/").replace("/", "-")
    text = text.strip(" .")  # Windows odia los nombres terminados en punto/espacio
    if not text:
        return "archivo"
    if len(text) > max_length:
        # Preserva la extensión si la hay.
        if "." in text[-10:]:
            stem, _, ext = text.rpartition(".")
            keep = max_length - len(ext) - 1
            text = stem[:keep] + "." + ext
        else:
            text = text[:max_length]
    return text
