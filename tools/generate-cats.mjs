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
 *   --resize=512              redimensionne le PNG final (nécessite `sharp`, optionnel)
 *   --force                   régénère même si le fichier existe déjà
 *   --dry-run                 affiche les prompts sans appeler l'API
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

// ---------------------------------------------------------------- arguments --

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
  dryRun: args.has('dry-run'),
};

// ------------------------------------------------------------------ clé API --

async function readApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  // Repli : tools/.env  (OPENAI_API_KEY=sk-...)
  try {
    const env = await readFile(join(ROOT, 'tools', '.env'), 'utf8');
    const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('OPENAI_API_KEY='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    /* pas de .env, tant pis */
  }
  return null;
}

// ------------------------------------------------------------------- utils ---

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(path) {
  try {
    const s = await stat(path);
    return s.size > 0;
  } catch {
    return false;
  }
}

/** `sharp` est optionnel : on ne redimensionne que s'il est installé. */
async function loadSharp() {
  if (!opts.resize) return null;
  try {
    const { default: sharp } = await import('sharp');
    return sharp;
  } catch {
    console.warn('⚠️  --resize demandé mais `sharp` n’est pas installé (npm i sharp) — images gardées en taille d’origine.');
    return null;
  }
}

/** Exécute `worker` sur chaque élément avec au plus `limit` tâches en parallèle. */
async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ------------------------------------------------------------- appel image ---

async function generateImage(apiKey, prompt) {
  const body = {
    model: opts.model,
    prompt,
    n: 1,
    size: opts.size,
    quality: opts.quality,
    background: 'transparent',
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

// -------------------------------------------------------------------- main ---

const catalog = JSON.parse(await readFile(join(ROOT, 'data', 'cats.json'), 'utf8'));

let todo = catalog.cats.filter((c) => c.id <= opts.count);
if (opts.only) todo = catalog.cats.filter((c) => opts.only.has(c.id));

if (opts.dryRun) {
  for (const cat of todo) console.log(`#${cat.id} ${cat.name}\n  ${cat.prompt}\n`);
  console.log(`${todo.length} prompts (aucun appel API : --dry-run)`);
  process.exit(0);
}

const apiKey = await readApiKey();
if (!apiKey) {
  console.error('❌ Clé manquante. Fais `export OPENAI_API_KEY=sk-...` ou crée tools/.env');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
const sharp = await loadSharp();

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
    if (sharp) {
      png = await sharp(png)
        .resize(opts.resize, opts.resize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
    }
    await writeFile(join(OUT_DIR, cat.file), png);
    done++;
    console.log(`✅ ${label} (${done}/${todo.length}) — ${(png.length / 1024).toFixed(0)} Ko`);
  } catch (err) {
    failures.push({ id: cat.id, name: cat.name, error: String(err.message ?? err) });
    console.error(`❌ ${label} — ${err.message ?? err}`);
  }
});

// Manifest : liste ce qui est réellement sur le disque, le front s'en sert
// pour savoir quels chats afficher en image plutôt qu'en SVG de repli.
const available = [];
for (const cat of catalog.cats) {
  if (await exists(join(OUT_DIR, cat.file))) available.push(cat.id);
}
await writeFile(
  join(OUT_DIR, 'manifest.json'),
  JSON.stringify({ model: opts.model, size: opts.size, available }, null, 2) + '\n',
  'utf8',
);

console.log(`\n📦 assets/cats/manifest.json — ${available.length}/100 images disponibles`);
if (failures.length) {
  console.log(`\n⚠️  ${failures.length} échec(s). Relance la commande pour réessayer :`);
  console.log(`   node tools/generate-cats.mjs --only=${failures.map((f) => f.id).join(',')}`);
  process.exitCode = 1;
}
