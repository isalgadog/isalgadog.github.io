import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USERNAME = "decusangelicum";
const PROFILE_URL = `https://www.instagram.com/${USERNAME}/`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const AVATAR_FILE = path.join(ASSETS_DIR, "avatar.jpg");
const META_FILE = path.join(ASSETS_DIR, "avatar-meta.json");

const headers = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9,es;q=0.8",
  "cache-control": "no-cache",
};

function extractOgImage(html) {
  const patterns = [
    /<meta\s+property="og:image"\s+content="([^"]+)"/i,
    /<meta\s+content="([^"]+)"\s+property="og:image"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].replaceAll("&amp;", "&");
  }
  return null;
}

async function readMaybe(file) {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

async function readMeta() {
  const raw = await readMaybe(META_FILE);
  if (!raw) return {};
  try {
    return JSON.parse(raw.toString("utf-8"));
  } catch {
    return {};
  }
}

async function writeMeta(meta) {
  await writeFile(META_FILE, `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
}

async function run() {
  await mkdir(ASSETS_DIR, { recursive: true });

  try {
    let imageUrl = null;
    let imageBuffer = null;
    let source = "instagram-og-image";

    const profileRes = await fetch(PROFILE_URL, { headers });
    if (profileRes.ok) {
      const html = await profileRes.text();
      imageUrl = extractOgImage(html);
    }

    if (imageUrl) {
      const imageRes = await fetch(imageUrl, {
        headers: { ...headers, referer: PROFILE_URL },
      });
      if (imageRes.ok) {
        imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      }
    }

    if (!imageBuffer || imageBuffer.byteLength < 10_000) {
      throw new Error("Instagram bloqueó/limitó la descarga del avatar (sin fallback de logo)");
    }
    const oldBuffer = await readMaybe(AVATAR_FILE);
    const changed = !oldBuffer || !oldBuffer.equals(imageBuffer);

    if (changed) {
      await writeFile(AVATAR_FILE, imageBuffer);
    }

    const now = Math.floor(Date.now() / 1000);
    const meta = await readMeta();
    const next = {
      ...meta,
      username: USERNAME,
      source,
      sourceProfile: PROFILE_URL,
      sourceImageUrl: imageUrl,
      lastChecked: now,
      avatarVersion: changed ? now : (meta.avatarVersion ?? now),
    };
    delete next.lastError;
    await writeMeta(next);

    console.log(changed ? "Avatar actualizado." : "Sin cambios en avatar.");
    return 0;
  } catch (error) {
    const now = Math.floor(Date.now() / 1000);
    const meta = await readMeta();
    const next = {
      ...meta,
      username: USERNAME,
      source: "avatar-updater",
      sourceProfile: PROFILE_URL,
      lastChecked: now,
      lastError: String(error?.message ?? error),
    };
    await writeMeta(next);

    console.error(`Error actualizando avatar: ${next.lastError}`);
    return 1;
  }
}

const code = await run();
process.exit(code);
