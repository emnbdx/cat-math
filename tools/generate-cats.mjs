#!/usr/bin/env node
/**
 * Génère les 100 images de chats kawaii avec l'API images d'OpenAI.
 *
 *   OPENAI_API_KEY=sk-... node tools/generate-cats.mjs
 *
 * Options :
 *   --model=gpt-image-2       modèle d'image
 *   --count=100               nombre de chats à générer (1..100)
 *   --only=3,7,42             ne (re)génère que ces identifiants
 *   --size=1024x1024          taille demandée à l'API
 *   --quality=medium          low | medium | high
 *   --concurrency=3           requêtes en parallèle
 *   --resize=512              redimensionne le PNG final
 *   --force                   régénère même si le fichier existe déjà
 *   --strip-only              retire le fond des PNG déjà présents (pas d'appel API)
 *   --dry-run                 affiche les prompts sans appeler l'API
 *
 * gpt-image-2 ne gère pas background:transparent : le modèle peint souvent un
 * damier gris/blanc. On demande un fond magenta (#FF00FF) dans le prompt, puis
 * sharp découpe le fond (magenta + damier) en vrai alpha PNG.
 *
 * Le script est reprenable : par défaut il saute les chats déjà générés.
 * Les images vont dans assets/cats/ et un manifest.json y est écrit.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'cats');
const API_URL = 'https://api.openai.com/v1/images/generations';

const CHROMA = { r: 255, g: 0, b: 255 };

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);

const opts = {
  model: args.get('model') ?? 'gpt-image-2',
  count: Number(args.get('count') ?? 100),
  only: args.has('only')
    ? new Set(String(args.get('only')).split(',').map((n) => Number(n.trim())))
    : null,
  size: args.get('size') ?? '1024x1024',
  quality: args.get('quality') ?? 'medium',
  concurrency: Math.max(1, Number(args.get('concurrency') ?? 3)),
  resize: args.has('resize') ? Number(args.get('resize')) : null,
  force: args.has('force'),
  stripOnly: args.has('strip-only'),
  dryRun: args.has('dry-run'),
};

async function readApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try {
    const env = await readFile(join(ROOT, 'tools', '.env'), 'utf8');
    const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('OPENAI_API_KEY='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    /* pas de .env */
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(path) {
  try {
    const s = await stat(path);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function loadSharp() {
  try {
    const { default: sharp } = await import('sharp');
    return sharp;
  } catch {
    return null;
  }
}

async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function isBackgroundPixel(r, g, b, a) {
  if (a === 0) return true;

  const dr = r - CHROMA.r;
  const dg = g - CHROMA.g;
  const db = b - CHROMA.b;
  if (dr * dr + dg * dg + db * db <= 90 * 90) return true;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (r + g + b) / 3;
  return lum >= 220 && sat <= 0.08;
}

/**
 * Découpe le fond (damier gris/blanc ou chroma magenta) en alpha réel.
 * Flood-fill depuis les bords pour ne pas manger les fourrures claires.
 */
async function stripBackground(sharp, input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = data;
  const n = width * height;
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    const o = i * 4;
    if (!isBackgroundPixel(px[o], px[o + 1], px[o + 2], px[o + 3])) return;
    visited[i] = 1;
    stack[top++] = i;
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (top > 0) {
    const i = stack[--top];
    const x = i % width;
    const y = (i / width) | 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  for (let i = 0; i < n; i++) {
    if (visited[i]) px[i * 4 + 3] = 0;
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (visited[i] || px[i * 4 + 3] === 0) continue;
      let nearBg = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (visited[(y + dy) * width + (x + dx)]) {
          nearBg = true;
          break;
        }
      }
      if (!nearBg) continue;
      const o = i * 4;
      const r = px[o];
      const g = px[o + 1];
      const b = px[o + 2];
      const dr = r - CHROMA.r;
      const dg = g - CHROMA.g;
      const db = b - CHROMA.b;
      const chromaDist = Math.sqrt(dr * dr + dg * dg + db * db);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (r + g + b) / 3;
      if (chromaDist < 140 || (lum >= 200 && sat <= 0.15)) {
        px[o + 3] = Math.min(px[o + 3], Math.round((chromaDist / 140) * 180));
      }
    }
  }

  let pipeline = sharp(px, { raw: { width, height, channels: 4 } });
  if (opts.resize) {
    pipeline = pipeline.resize(opts.resize, opts.resize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function generateImage(apiKey, prompt) {
  const body = {
    model: opts.model,
    prompt,
    n: 1,
    size: opts.size,
    quality: opts.quality,
    output_format: 'png',
  };

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (res.ok) {
      const json = await res.json();
      const item = json.data?.[0];
      if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
      if (item?.url) {
        const img = await fetch(item.url);
        if (!img.ok) throw new Error(`Téléchargement de l’image : HTTP ${img.status}`);
        return Buffer.from(await img.arrayBuffer());
      }
      throw new Error(`Réponse inattendue : ${JSON.stringify(json).slice(0, 300)}`);
    }

    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    const wait = 2 ** attempt * 1000;
    console.warn(`   ↻ HTTP ${res.status}, nouvelle tentative dans ${wait / 1000}s…`);
    await sleep(wait);
  }
  throw new Error('inatteignable');
}

async function writeManifest(model, size) {
  const available = [];
  for (const cat of catalog.cats) {
    if (await exists(join(OUT_DIR, cat.file))) available.push(cat.id);
  }
  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ model, size, available }, null, 2) + '\n',
    'utf8',
  );
  return available;
}

const catalog = JSON.parse(await readFile(join(ROOT, 'data', 'cats.json'), 'utf8'));

let todo = catalog.cats.filter((c) => c.id <= opts.count);
if (opts.only) todo = catalog.cats.filter((c) => opts.only.has(c.id));

if (opts.dryRun) {
  for (const cat of todo) console.log(`#${cat.id} ${cat.name}\n  ${cat.prompt}\n`);
  console.log(`${todo.length} prompts (aucun appel API : --dry-run)`);
  process.exit(0);
}

const sharp = await loadSharp();
if (!sharp) {
  console.error('❌ `sharp` est requis pour découper le fond. Dans tools/ : npm i sharp');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

if (opts.stripOnly) {
  const present = [];
  for (const cat of todo) {
    if (await exists(join(OUT_DIR, cat.file))) present.push(cat);
  }
  console.log(`✂️  Découpe du fond sur ${present.length} image(s)…\n`);
  const failures = [];
  let done = 0;
  await pool(present, opts.concurrency, async (cat) => {
    const label = `#${String(cat.id).padStart(3, '0')} ${cat.name}`;
    const path = join(OUT_DIR, cat.file);
    try {
      const raw = await readFile(path);
      const png = await stripBackground(sharp, raw);
      await writeFile(path, png);
      done++;
      console.log(`✅ ${label} (${done}/${present.length}) — ${(png.length / 1024).toFixed(0)} Ko`);
    } catch (err) {
      failures.push(cat.id);
      console.error(`❌ ${label} — ${err.message ?? err}`);
    }
  });
  const available = await writeManifest(opts.model, opts.size);
  console.log(`\n📦 assets/cats/manifest.json — ${available.length}/100 images disponibles`);
  if (failures.length) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}

const apiKey = await readApiKey();
if (!apiKey) {
  console.error('❌ Clé manquante. Fais `export OPENAI_API_KEY=sk-...` ou crée tools/.env');
  process.exit(1);
}

const skipped = [];
if (!opts.force) {
  const kept = [];
  for (const cat of todo) {
    if (await exists(join(OUT_DIR, cat.file))) skipped.push(cat);
    else kept.push(cat);
  }
  todo = kept;
}

console.log(
  `🎨 modèle=${opts.model} taille=${opts.size} qualité=${opts.quality} ` +
    `parallèle=${opts.concurrency}\n   ${todo.length} à générer, ${skipped.length} déjà présents\n`,
);

const failures = [];
let done = 0;

await pool(todo, opts.concurrency, async (cat) => {
  const label = `#${String(cat.id).padStart(3, '0')} ${cat.name}`;
  try {
    let png = await generateImage(apiKey, cat.prompt);
    png = await stripBackground(sharp, png);
    await writeFile(join(OUT_DIR, cat.file), png);
    done++;
    console.log(`✅ ${label} (${done}/${todo.length}) — ${(png.length / 1024).toFixed(0)} Ko`);
  } catch (err) {
    failures.push({ id: cat.id, name: cat.name, error: String(err.message ?? err) });
    console.error(`❌ ${label} — ${err.message ?? err}`);
  }
});

const available = await writeManifest(opts.model, opts.size);

console.log(`\n📦 assets/cats/manifest.json — ${available.length}/100 images disponibles`);
if (failures.length) {
  console.log(`\n⚠️  ${failures.length} échec(s). Relance la commande pour réessayer :`);
  console.log(`   node tools/generate-cats.mjs --only=${failures.map((f) => f.id).join(',')}`);
  process.exitCode = 1;
}
