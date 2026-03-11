import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USERNAME = "decusangelicum"
ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
AVATAR_FILE = ASSETS / "avatar.jpg"
META_FILE = ASSETS / "avatar-meta.json"
PROFILE_URL = f"https://www.instagram.com/{USERNAME}/"


def fetch_text(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
            "Cache-Control": "no-cache",
        },
    )
    with urlopen(req, timeout=20) as res:
        return res.read().decode("utf-8", errors="replace")


def fetch_bytes(url: str) -> bytes:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": PROFILE_URL,
            "Cache-Control": "no-cache",
        },
    )
    with urlopen(req, timeout=20) as res:
        return res.read()


def extract_og_image(html: str) -> str | None:
    patterns = [
        r'<meta property="og:image" content="([^"]+)"',
        r"<meta content=\"([^\"]+)\" property=\"og:image\"",
    ]
    for p in patterns:
        m = re.search(p, html)
        if m:
            return m.group(1).replace("&amp;", "&")
    return None


def load_meta() -> dict:
    if not META_FILE.exists():
        return {}
    try:
        return json.loads(META_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_meta(meta: dict) -> None:
    META_FILE.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)

    try:
        html = fetch_text(PROFILE_URL)
        image_url = extract_og_image(html)
        if not image_url:
            raise RuntimeError("No se encontró og:image en el perfil.")

        image_bytes = fetch_bytes(image_url)
        if len(image_bytes) < 10_000:
            raise RuntimeError("Imagen descargada demasiado pequeña; posible respuesta inválida.")

        old_bytes = AVATAR_FILE.read_bytes() if AVATAR_FILE.exists() else b""
        changed = image_bytes != old_bytes

        if changed:
            AVATAR_FILE.write_bytes(image_bytes)

        meta = load_meta()
        meta.update(
            {
                "username": USERNAME,
                "source": "instagram-og-image",
                "sourceProfile": PROFILE_URL,
                "lastChecked": int(time.time()),
                "avatarVersion": int(time.time()) if changed else meta.get("avatarVersion", int(time.time())),
            }
        )
        save_meta(meta)

        print("Avatar actualizado." if changed else "Sin cambios en avatar.")
        return 0

    except (HTTPError, URLError, TimeoutError, RuntimeError) as e:
        print(f"Error actualizando avatar: {e}")
        # Keep existing avatar; only update heartbeat metadata
        meta = load_meta()
        meta.update(
            {
                "username": USERNAME,
                "source": "instagram-og-image",
                "sourceProfile": PROFILE_URL,
                "lastChecked": int(time.time()),
                "lastError": str(e),
            }
        )
        save_meta(meta)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
