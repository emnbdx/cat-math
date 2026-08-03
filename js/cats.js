/**
 * Catalogue des chats + rendu.
 *
 * Chaque chat a une image PNG générée par tools/generate-cats.mjs. Tant qu'une
 * image n'existe pas, on dessine un chat kawaii en SVG à la volée : le jeu est
 * donc jouable immédiatement, sans clé OpenAI et sans images.
 */

const CATALOG_URL = new URL('../data/cats.json', import.meta.url);
const MANIFEST_URL = new URL('../assets/cats/manifest.json', import.meta.url);
const IMG_BASE = new URL('../assets/cats/', import.meta.url);

const OUTLINE = '#5b4650';
const DARK = '#3d2f37';
const MOUTH = '#c76b85';

let loaded = null;

/** Charge le catalogue (et la liste des images réellement présentes). */
export async function loadCats() {
  if (loaded) return loaded;

  const catalog = await fetch(CATALOG_URL).then((r) => {
    if (!r.ok) throw new Error(`data/cats.json introuvable (HTTP ${r.status})`);
    return r.json();
  });

  // Le manifest n'existe que si le script de génération a tourné.
  let available = new Set();
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) available = new Set((await res.json()).available ?? []);
  } catch {
    /* pas d'images : on restera en SVG */
  }

  loaded = { cats: catalog.cats, available };
  return loaded;
}

export function getCat(id) {
  return loaded?.cats[id - 1] ?? null;
}

export function hasImage(id) {
  return Boolean(loaded?.available.has(id));
}

/**
 * Élément visuel d'un chat : <img> si l'image existe, sinon SVG.
 * Si l'image est censée exister mais échoue au chargement, on retombe en SVG.
 */
export function catArt(cat) {
  if (hasImage(cat.id)) {
    const img = document.createElement('img');
    img.src = new URL(cat.file, IMG_BASE).href;
    img.alt = `${cat.name}, chat ${cat.expression}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => img.replaceWith(svgElement(cat)), { once: true });
    return img;
  }
  return svgElement(cat);
}

function svgElement(cat) {
  const wrap = document.createElement('div');
  wrap.innerHTML = catSvg(cat);
  const svg = wrap.firstElementChild;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${cat.name}, chat ${cat.expression}`);
  return svg;
}

/* ============================================================
   Chat kawaii procédural — 9 regards × 7 bouches × 6 robes
   ============================================================ */

export function catSvg(cat) {
  const { palette, pattern, eyes, mouth } = cat.svg;
  const fur = palette.fur;
  const accent = palette.accent;

  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <g stroke="${OUTLINE}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    ${tail(accent, pattern)}
    <ellipse cx="60" cy="95" rx="29" ry="22" fill="${fur}"/>
    ${chest(pattern)}
    ${paws(fur)}
    <path d="M34 33 L28 9 L53 23 Z" fill="${earColor(fur, accent, pattern)}"/>
    <path d="M86 33 L92 9 L67 23 Z" fill="${earColor(fur, accent, pattern)}"/>
    <path d="M36 29 L33 15 L48 24 Z" fill="${palette.blush}" stroke="none"/>
    <path d="M84 29 L87 15 L72 24 Z" fill="${palette.blush}" stroke="none"/>
    <circle cx="60" cy="52" r="32" fill="${fur}"/>
    ${headPattern(pattern, accent)}
    ${muzzle(pattern)}
  </g>
  <g>
    ${eyePair(eyes)}
    <path d="M56.5 60.5 h7 L60 65 Z" fill="${MOUTH}"/>
    ${mouthShape(mouth)}
    <g fill="${palette.blush}" opacity=".55">
      <ellipse cx="38" cy="61" rx="7" ry="4"/>
      <ellipse cx="82" cy="61" rx="7" ry="4"/>
    </g>
    <g stroke="${OUTLINE}" stroke-width="1.5" stroke-linecap="round" opacity=".55">
      <path d="M26 57 l-11 -3 M26 63 l-11 3 M94 57 l11 -3 M94 63 l11 3"/>
    </g>
  </g>
</svg>`;
}

function earColor(fur, accent, pattern) {
  return pattern === 'points' ? accent : fur;
}

function tail(accent, pattern) {
  const stripes =
    pattern === 'tabby'
      ? `<path d="M99 96 h9 M101 88 h9" stroke="${OUTLINE}" stroke-width="2" opacity=".35"/>`
      : '';
  return `<path d="M85 98 q22 6 20 -14 q-1 -10 -9 -9" fill="none" stroke="${OUTLINE}" stroke-width="9" stroke-linecap="round"/>
    <path d="M85 98 q22 6 20 -14 q-1 -10 -9 -9" fill="none" stroke="${accent}" stroke-width="5.5" stroke-linecap="round"/>
    ${stripes}`;
}

function chest(pattern) {
  if (pattern !== 'bicolour' && pattern !== 'patch') return '';
  return `<ellipse cx="60" cy="99" rx="15" ry="15" fill="#fffaf6" stroke="none" opacity=".95"/>`;
}

function paws(fur) {
  return `<ellipse cx="45" cy="110" rx="9" ry="6" fill="${fur}"/>
    <ellipse cx="75" cy="110" rx="9" ry="6" fill="${fur}"/>`;
}

function muzzle(pattern) {
  if (pattern === 'points') {
    return `<ellipse cx="60" cy="62" rx="17" ry="12" fill="#ffffff" stroke="none" opacity=".5"/>`;
  }
  if (pattern === 'bicolour') {
    return `<ellipse cx="60" cy="64" rx="20" ry="14" fill="#fffaf6" stroke="none" opacity=".85"/>`;
  }
  return '';
}

function headPattern(pattern, accent) {
  switch (pattern) {
    case 'tabby':
      return `<g fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity=".8">
        <path d="M52 26 l-3 10 M60 24 v11 M68 26 l3 10"/>
      </g>`;
    case 'spots':
      return `<g fill="${accent}" stroke="none" opacity=".6">
        <circle cx="44" cy="34" r="3.4"/><circle cx="60" cy="29" r="3"/><circle cx="76" cy="34" r="3.4"/>
        <circle cx="36" cy="46" r="2.6"/><circle cx="84" cy="46" r="2.6"/>
      </g>`;
    case 'patch':
      return `<path d="M60 21 a32 32 0 0 1 30 22 a30 30 0 0 1 -30 -3 Z" fill="${accent}" stroke="none" opacity=".75"/>`;
    default:
      return '';
  }
}

/* ------------------------------------------------------------- regards --- */

function eye(cx, style) {
  const cy = 50;
  switch (style) {
    case 1: // fermés, sourire heureux
      return `<path d="M${cx - 7} ${cy + 2} q7 -9 14 0" fill="none" stroke="${DARK}" stroke-width="2.8" stroke-linecap="round"/>`;
    case 2: // endormi
      return `<path d="M${cx - 7} ${cy - 1} q7 6 14 0" fill="none" stroke="${DARK}" stroke-width="2.8" stroke-linecap="round"/>`;
    case 3: // yeux plissés, air satisfait
      return `<path d="M${cx - 6} ${cy} q6 -4 12 0" fill="none" stroke="${DARK}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 6: // larme d'émotion
      return `${normalEye(cx, cy, 0)}<path d="M${cx + 5} ${cy + 7} q4 6 0 8 q-4 -2 0 -8 Z" fill="#8ec9f0" stroke="none"/>`;
    case 7: // yeux pétillants
      return `${normalEye(cx, cy, 0)}<path d="M${cx + 3} ${cy - 8} l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4 Z" fill="#fff8b0" stroke="none"/>`;
    case 8: // yeux en cœur
      return `<path d="M${cx} ${cy + 6} c-8 -6 -8 -13 -3.5 -13 c2 0 3 1.2 3.5 2.4 c.5 -1.2 1.5 -2.4 3.5 -2.4 c4.5 0 4.5 7 -3.5 13 Z" fill="#e8567c" stroke="none"/>`;
    case 5: // regard de côté
      return normalEye(cx, cy, 2.5);
    default: // 0 et 4 (l'œil ouvert du clin d'œil)
      return normalEye(cx, cy, 0);
  }
}

function normalEye(cx, cy, shift) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="5.4" ry="7" fill="${DARK}"/>
    <circle cx="${cx - 1.6 + shift}" cy="${cy - 2.4}" r="2" fill="#fff"/>
    <circle cx="${cx + 2 + shift}" cy="${cy + 2.6}" r="1" fill="#fff" opacity=".8"/>`;
}

function eyePair(style) {
  // 4 = clin d'œil : l'œil droit se ferme
  if (style === 4) return eye(46, 0) + eye(74, 1);
  return eye(46, style) + eye(74, style);
}

/* -------------------------------------------------------------- bouches -- */

function mouthShape(style) {
  const s = `fill="none" stroke="${OUTLINE}" stroke-width="2.4" stroke-linecap="round"`;
  switch (style) {
    case 1: // petit sourire de chat (ω)
      return `<path d="M53 66 q3.5 4 7 0 q3.5 4 7 0" ${s}/>`;
    case 2: // neutre
      return `<path d="M56 68 h8" ${s}/>`;
    case 3: // bouche grande ouverte
      return `<ellipse cx="60" cy="71" rx="7" ry="8" fill="${MOUTH}" stroke="${OUTLINE}" stroke-width="2.2"/>
        <path d="M55 75 q5 5 10 0 q-5 3 -10 0 Z" fill="#ff9db3" stroke="none"/>`;
    case 4: // petit bâillement
      return `<ellipse cx="60" cy="70" rx="4.4" ry="6" fill="${MOUTH}" stroke="${OUTLINE}" stroke-width="2"/>`;
    case 5: // langue dehors
      return `<path d="M53 66 q7 6 14 0" ${s}/>
        <path d="M57 70 q3 8 6 0 Z" fill="#ff8fab" stroke="${OUTLINE}" stroke-width="1.8"/>`;
    case 6: // moue boudeuse
      return `<path d="M54 71 q6 -6 12 0" ${s}/>`;
    default: // grand sourire
      return `<path d="M51 66 q9 9 18 0" ${s}/>`;
  }
}
