/**
 * Le décor, dessiné pixel par pixel au démarrage — aucune image à héberger.
 *
 * Deux familles :
 *
 * - les **terrains** (chemin, eau, hautes herbes, feuillage) sont *auto-tuilés* :
 *   la forme d'une tuile dépend de ses voisines, donc un chemin fait des
 *   virages arrondis, un étang a une rive, et deux arbres côte à côte forment
 *   un seul houppier. C'est ce qui distingue une carte dessinée d'un damier.
 * - les **objets** (maison, panneau, barrière, ordinateur…) sont des tuiles
 *   fixes posées sur l'herbe.
 */

import { TILE, makeCanvas, hash } from './pixel.js';

/* ------------------------------------------------------------ palettes -- */

const C = {
  grass: '#7cc86c',
  grassTint: '#88d073',
  grassDark: '#63ae58',
  grassLight: '#95d77e',
  grassEdge: '#4f9048',

  dirt: '#e3c495',
  dirtDark: '#c9a679',
  dirtLight: '#f2ddb8',
  dirtEdge: '#a8875e',

  water: '#4aa9e0',
  waterDark: '#2f86bf',
  waterLight: '#8fd6f2',
  foam: '#e9f8ff',
  sand: '#f0dfb4',
  sandDark: '#d8c294',

  leaf: '#3f8f4f',
  leafDark: '#2a6b3c',
  leafLight: '#63b268',
  leafEdge: '#1f5230',
  trunk: '#8a5c38',
  trunkDark: '#5f3d24',

  blade: '#43904a',
  bladeDark: '#2f6f39',
  bladeLight: '#6fbb63',

  wood: '#c58c56',
  woodDark: '#8c5f36',
  woodLight: '#e0b183',

  roof: '#e2635a',
  roofDark: '#b8433f',
  roofLight: '#f2938a',
  wall: '#f7e9d2',
  wallDark: '#d9bd97',
  wallLine: '#c0a179',
  glass: '#8fd6f2',
  glassDark: '#5aa8cf',

  rock: '#b0adb6',
  rockDark: '#84818c',
  rockLight: '#d3d1d8',

  ink: '#3a2f3d',
  white: '#ffffff',
  petal: ['#ff9ec4', '#ffe066', '#ffffff', '#c8a2ff'],
};

/** Tuiles infranchissables. */
export const SOLID = new Set(['T', '~', 'H', 'h', 'D', 'F', 'r', 'S', 'P', 'W', 'B', 'b']);

/** Tuiles où l'on peut croiser un chat sauvage. */
export const ENCOUNTER = new Set(['"']);

/** Terrains auto-tuilés : caractère → réglages de forme. */
const TERRAIN = {
  '=': { kind: 'path', margin: 3, radius: 5, notch: 4 },
  '~': { kind: 'water', margin: 3, radius: 5, notch: 4 },
  '"': { kind: 'blades', margin: 1, radius: 3, notch: 2 },
  T: { kind: 'canopy', margin: 1, radius: 5, notch: 4 },
};

export function isTerrain(ch) {
  return ch in TERRAIN;
}

/* -------------------------------------------------- géométrie des bords -- */

const N = 1;
const NE = 2;
const E = 4;
const SE = 8;
const S = 16;
const SW = 32;
const W = 64;
const NW = 128;

/**
 * Silhouette d'une tuile de terrain, à partir des 8 voisines.
 * Renvoie une grille de booléens 16×16.
 */
function silhouette(mask, { margin, radius, notch }) {
  const has = (bit) => (mask & bit) !== 0;
  const top = has(N) ? 0 : margin;
  const bottom = has(S) ? 0 : margin;
  const left = has(W) ? 0 : margin;
  const right = has(E) ? 0 : margin;

  const round = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 > r ** 2;
  const grid = [];

  for (let y = 0; y < TILE; y++) {
    const row = [];
    for (let x = 0; x < TILE; x++) {
      let on = x >= left && x <= TILE - 1 - right && y >= top && y <= TILE - 1 - bottom;

      // coins sortants : on les arrondit
      if (on && !has(N) && !has(W) && x < left + radius && y < top + radius) {
        on = !round(x, y, left + radius - 0.5, top + radius - 0.5, radius - 0.5);
      }
      if (on && !has(N) && !has(E) && x > TILE - 1 - right - radius && y < top + radius) {
        on = !round(x, y, TILE - right - radius - 0.5, top + radius - 0.5, radius - 0.5);
      }
      if (on && !has(S) && !has(W) && x < left + radius && y > TILE - 1 - bottom - radius) {
        on = !round(x, y, left + radius - 0.5, TILE - bottom - radius - 0.5, radius - 0.5);
      }
      if (on && !has(S) && !has(E) && x > TILE - 1 - right - radius && y > TILE - 1 - bottom - radius) {
        on = !round(x, y, TILE - right - radius - 0.5, TILE - bottom - radius - 0.5, radius - 0.5);
      }

      // coins rentrants : petite encoche là où la diagonale manque
      if (on && has(N) && has(W) && !has(NW) && x < notch && y < notch) {
        on = round(x, y, -0.5, -0.5, notch);
      }
      if (on && has(N) && has(E) && !has(NE) && x >= TILE - notch && y < notch) {
        on = round(x, y, TILE - 0.5, -0.5, notch);
      }
      if (on && has(S) && has(W) && !has(SW) && x < notch && y >= TILE - notch) {
        on = round(x, y, -0.5, TILE - 0.5, notch);
      }
      if (on && has(S) && has(E) && !has(SE) && x >= TILE - notch && y >= TILE - notch) {
        on = round(x, y, TILE - 0.5, TILE - 0.5, notch);
      }

      row.push(on);
    }
    grid.push(row);
  }
  return grid;
}

const at = (grid, x, y) => (x < 0 || y < 0 || x >= TILE || y >= TILE ? null : grid[y][x]);

/** Pixels de la silhouette qui touchent le vide (bord intérieur). */
function isRim(grid, x, y) {
  return [at(grid, x - 1, y), at(grid, x + 1, y), at(grid, x, y - 1), at(grid, x, y + 1)].some(
    (n) => n === false,
  );
}

/** Pixels hors silhouette à moins de `d` pixels d'elle (bord extérieur). */
function nearShape(grid, x, y, d) {
  for (let dy = -d; dy <= d; dy++) {
    for (let dx = -d; dx <= d; dx++) {
      if (at(grid, x + dx, y + dy)) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------- l'herbe -- */

function grassBase(ctx, variant = 0) {
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, TILE, TILE);

  // tramage : deux verts très proches en damier, pour que le pré vibre un peu
  ctx.fillStyle = C.grassTint;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if ((x + y) % 4 === 0) ctx.fillRect(x, y, 1, 1);
    }
  }

  // touffes discrètes : le tapis vert ne doit pas être plat
  ctx.fillStyle = C.grassDark;
  ctx.fillRect(2, 4, 2, 1);
  ctx.fillRect(9, 11, 2, 1);
  ctx.fillStyle = C.grassLight;
  ctx.fillRect(11, 3, 2, 1);
  ctx.fillRect(5, 9, 2, 1);

  if (variant === 1) {
    ctx.fillStyle = C.grassDark;
    ctx.fillRect(4, 12, 1, 2);
    ctx.fillRect(5, 11, 1, 3);
    ctx.fillRect(6, 13, 1, 1);
    ctx.fillStyle = C.grassLight;
    ctx.fillRect(5, 10, 1, 1);
  }
  if (variant === 2) {
    ctx.fillStyle = C.grassDark;
    ctx.fillRect(10, 5, 1, 3);
    ctx.fillRect(11, 4, 1, 4);
    ctx.fillStyle = C.grassLight;
    ctx.fillRect(11, 3, 1, 1);
  }
}

function flower(ctx, color, cx = 7, cy = 7) {
  ctx.fillStyle = C.grassDark;
  ctx.fillRect(cx, cy + 2, 1, 3);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 1, cy, 3, 1);
  ctx.fillRect(cx, cy - 1, 1, 3);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(cx, cy, 1, 1);
}

/* --------------------------------------------------- terrains auto-tuilés */

function paintPath(ctx, grid) {
  // l'herbe s'assombrit juste au bord du chemin : la transition est plus douce
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (grid[y][x] || !nearShape(grid, x, y, 1)) continue;
      ctx.fillStyle = C.grassEdge;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!grid[y][x]) continue;
      const rim = isRim(grid, x, y);
      const topRim = at(grid, x, y - 1) === false;
      ctx.fillStyle = rim ? C.dirtEdge : C.dirt;
      if (!rim && topRim) ctx.fillStyle = C.dirtLight;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // gravillons
  ctx.fillStyle = C.dirtDark;
  for (const [x, y] of [[5, 4], [10, 8], [7, 12]]) {
    if (grid[y]?.[x] && !isRim(grid, x, y)) ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = C.dirtLight;
  if (grid[6]?.[9] && !isRim(grid, 9, 6)) ctx.fillRect(9, 6, 1, 1);
}

function paintWater(ctx, grid, frame) {
  // plage : un liseré de sable tout autour de l'eau
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (grid[y][x] || !nearShape(grid, x, y, 2)) continue;
      ctx.fillStyle = nearShape(grid, x, y, 1) ? C.sand : C.sandDark;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!grid[y][x]) continue;
      const rim = isRim(grid, x, y);
      ctx.fillStyle = rim ? C.waterDark : C.water;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // écume qui glisse le long de la rive, et petites vaguelettes
  ctx.fillStyle = C.foam;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!grid[y][x] || at(grid, x, y - 1) !== false) continue;
      if ((x + frame * 3) % 6 < 3) ctx.fillRect(x, y + 1, 1, 1);
    }
  }
  ctx.fillStyle = C.waterLight;
  for (const [x, y] of [[3, 5], [4, 5], [9, 9], [10, 9], [11, 9], [6, 12], [7, 12]]) {
    const px = (x + frame * 4) % TILE;
    if (grid[y]?.[px] && !isRim(grid, px, y)) ctx.fillRect(px, y, 1, 1);
  }
}

/** Touffes d'herbe haute : trois bouquets par tuile, pointes claires. */
const TUFTS = [
  [[3, 9, 4], [9, 7, 5], [13, 11, 3]],
  [[4, 7, 5], [11, 10, 4], [1, 12, 3]],
  [[7, 8, 5], [13, 7, 4], [3, 12, 3]],
  [[2, 10, 4], [8, 11, 4], [12, 6, 5]],
];

function paintBlades(ctx, grid, variant) {
  const inside = (x, y) => grid[y]?.[x] === true;

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!inside(x, y)) continue;
      ctx.fillStyle = C.blade;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // chaque bouquet : un dôme clair, une base sombre, deux ou trois brins
  for (const [cx, cy, r] of TUFTS[variant % TUFTS.length]) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (!inside(x, y)) continue;
        const dx = (x - cx) / r;
        const dy = (y - cy) / (r * 0.9);
        if (dx * dx + dy * dy > 1) continue;
        ctx.fillStyle = y < cy - r * 0.25 ? C.bladeLight : y > cy + r * 0.45 ? C.bladeDark : C.blade;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const [bx, top] of [[cx - 1, cy - r - 1], [cx + 1, cy - r]]) {
      if (inside(bx, top)) {
        ctx.fillStyle = C.bladeLight;
        ctx.fillRect(bx, top, 1, 2);
      }
    }
  }

  // ombre au pied de la touffe
  for (let x = 0; x < TILE; x++) {
    for (let y = TILE - 1; y >= 0; y--) {
      if (!inside(x, y)) continue;
      if (!inside(x, y + 1)) {
        ctx.fillStyle = C.bladeDark;
        ctx.fillRect(x, y, 1, 1);
      }
      break;
    }
  }
}

/** Bouquets de feuillage : trois positions selon la variante de la tuile. */
const CLUMPS = [
  [[4, 4, 3.4], [11, 5, 2.8], [7, 11, 3.2], [13, 11, 2.4]],
  [[3, 7, 2.6], [9, 3, 3.6], [13, 8, 2.8], [6, 12, 3.0]],
  [[6, 3, 3.0], [2, 10, 2.6], [10, 9, 3.6], [14, 4, 2.4]],
  [[8, 6, 3.8], [3, 4, 2.6], [12, 12, 3.0], [5, 13, 2.4]],
  [[5, 9, 3.4], [11, 4, 3.2], [2, 4, 2.4], [14, 10, 2.6]],
  [[7, 5, 2.8], [12, 8, 3.4], [4, 12, 3.0], [10, 13, 2.4]],
];

function paintCanopy(ctx, grid, mask, variant) {
  const hasSouth = (mask & S) !== 0;

  // tronc : uniquement sur la tuile la plus basse du bosquet
  if (!hasSouth) {
    ctx.fillStyle = C.trunkDark;
    ctx.fillRect(6, 11, 4, 5);
    ctx.fillStyle = C.trunk;
    ctx.fillRect(7, 11, 2, 5);
    ctx.fillStyle = 'rgba(30, 60, 35, .25)';
    ctx.fillRect(5, 15, 6, 1);
  }

  const inside = (x, y) => grid[y]?.[x] === true;

  // 1. masse du houppier
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!inside(x, y)) continue;
      ctx.fillStyle = C.leaf;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 2. un houppier rond par tuile, cerné : même collés, les arbres restent
  //    des arbres et pas un mur de vert
  const cx = 7.5;
  const cy = 7.5;
  const R = 7.9 - (variant % 3) * 0.5;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!inside(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > R) continue;
      if (d > R - 1) ctx.fillStyle = C.leafEdge;
      else if (x - cx + (y - cy) < -3) ctx.fillStyle = C.leafLight;
      else if (y - cy > 3.5) ctx.fillStyle = C.leafDark;
      else ctx.fillStyle = C.leaf;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 3. bouquets de feuilles, pour que deux arbres ne soient pas identiques
  for (const [bx, by, r] of CLUMPS[variant % CLUMPS.length].slice(0, 2)) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (!inside(x, y) || Math.hypot(x - cx, y - cy) > 6.6) continue;
        const d = Math.hypot(x - bx, y - by);
        if (d > r) continue;
        ctx.fillStyle = x - bx + (y - by) < -0.5 ? C.leafLight : C.leaf;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // 4. ombre portée sur le bas du bosquet
  for (let x = 0; x < TILE; x++) {
    for (let y = TILE - 1; y >= 0; y--) {
      if (!inside(x, y)) continue;
      if (!inside(x, y + 1)) {
        ctx.fillStyle = C.leafDark;
        ctx.fillRect(x, y, 1, 1);
        if (inside(x, y - 1)) ctx.fillRect(x, y - 1, 1, 1);
      }
      break;
    }
  }

  // 5. contour sombre, et liseré clair sur le dessus
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!inside(x, y) || !isRim(grid, x, y)) continue;
      ctx.fillStyle = C.leafEdge;
      ctx.fillRect(x, y, 1, 1);
      if (!inside(x, y - 1) && inside(x, y + 1)) {
        ctx.fillStyle = C.leafLight;
        ctx.fillRect(x, y + 1, 1, 1);
      }
    }
  }
}

/* -------------------------------------------------------------- objets -- */

function wall(ctx) {
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = C.wallLine;
  ctx.fillRect(0, 7, TILE, 1);
  ctx.fillRect(0, 15, TILE, 1);
  ctx.fillStyle = C.wallDark;
  ctx.fillRect(5, 0, 1, 7);
  ctx.fillRect(11, 8, 1, 7);
}

function windowWall(ctx) {
  wall(ctx);
  ctx.fillStyle = C.wood;
  ctx.fillRect(2, 2, 12, 11);
  ctx.fillStyle = C.glassDark;
  ctx.fillRect(3, 3, 10, 9);
  ctx.fillStyle = C.glass;
  ctx.fillRect(3, 3, 10, 5);
  ctx.fillStyle = C.white;
  ctx.fillRect(4, 4, 3, 2);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(8, 3, 1, 9);
  ctx.fillRect(3, 7, 10, 1);
  ctx.fillRect(2, 12, 12, 1);
}

function roof(ctx, row) {
  ctx.fillStyle = row === 0 ? C.roofDark : C.roof;
  ctx.fillRect(0, 0, TILE, TILE);
  if (row === 0) {
    // faîtage
    ctx.fillStyle = '#8f2f2c';
    ctx.fillRect(0, 0, TILE, 3);
    ctx.fillStyle = C.roof;
    ctx.fillRect(0, 8, TILE, 8);
  }
  // tuiles en écailles
  ctx.fillStyle = row === 0 ? C.roofDark : '#c94b46';
  for (let y = row === 0 ? 8 : 0; y < TILE; y += 4) {
    ctx.fillRect(0, y + 3, TILE, 1);
    for (let x = (y / 4) % 2 ? 0 : 4; x < TILE; x += 8) ctx.fillRect(x, y, 1, 3);
  }
  ctx.fillStyle = C.roofLight;
  ctx.fillRect(0, row === 0 ? 3 : 0, TILE, 1);
}

function door(ctx) {
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(2, 1, 12, 15);
  ctx.fillStyle = C.wood;
  ctx.fillRect(3, 2, 10, 14);
  ctx.fillStyle = C.woodLight;
  ctx.fillRect(3, 2, 10, 1);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(3, 7, 10, 1);
  ctx.fillStyle = '#f5d76e';
  ctx.fillRect(10, 9, 2, 2);
}

/** L'ordinateur qui ouvre la boîte à chats. */
function terminal(ctx) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(2, 1, 12, 14);
  ctx.fillStyle = '#e7ecf5';
  ctx.fillRect(3, 2, 10, 11);
  ctx.fillStyle = '#b9c4d8';
  ctx.fillRect(3, 12, 10, 1);
  ctx.fillStyle = C.ink;
  ctx.fillRect(4, 3, 8, 7);
  ctx.fillStyle = '#54c8dc';
  ctx.fillRect(5, 4, 6, 5);
  ctx.fillStyle = '#a9ecf5';
  ctx.fillRect(5, 4, 6, 2);
  ctx.fillStyle = C.white;
  ctx.fillRect(6, 5, 2, 1);
  ctx.fillStyle = '#ff8fab';
  ctx.fillRect(5, 11, 2, 1);
  ctx.fillStyle = '#8fd6f2';
  ctx.fillRect(9, 11, 3, 1);
  ctx.fillStyle = 'rgba(40,30,40,.25)';
  ctx.fillRect(2, 15, 12, 1);
}

function sign(ctx) {
  ctx.fillStyle = C.trunkDark;
  ctx.fillRect(7, 9, 2, 6);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(1, 2, 14, 8);
  ctx.fillStyle = C.wood;
  ctx.fillRect(2, 3, 12, 6);
  ctx.fillStyle = C.woodLight;
  ctx.fillRect(2, 3, 12, 1);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(3, 5, 9, 1);
  ctx.fillRect(3, 7, 6, 1);
  ctx.fillStyle = 'rgba(40,30,40,.22)';
  ctx.fillRect(4, 15, 8, 1);
}

function fence(ctx, dirs) {
  const horizontal = dirs.includes('h');
  const vertical = dirs.includes('v');
  if (horizontal) {
    ctx.fillStyle = C.wood;
    ctx.fillRect(0, 5, TILE, 2);
    ctx.fillRect(0, 10, TILE, 2);
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(0, 7, TILE, 1);
    ctx.fillRect(0, 12, TILE, 1);
  }
  if (vertical) {
    ctx.fillStyle = C.wood;
    ctx.fillRect(5, 0, 2, TILE);
    ctx.fillRect(10, 0, 2, TILE);
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(7, 0, 1, TILE);
    ctx.fillRect(12, 0, 1, TILE);
  }
  if (horizontal) {
    for (const x of [2, 12]) {
      ctx.fillStyle = C.woodDark;
      ctx.fillRect(x, 2, 2, 13);
      ctx.fillStyle = C.woodLight;
      ctx.fillRect(x, 2, 2, 1);
    }
  } else if (vertical) {
    ctx.fillStyle = C.woodDark;
    ctx.fillRect(3, 2, 10, 2);
    ctx.fillRect(3, 12, 10, 2);
  }
  ctx.fillStyle = 'rgba(40,30,40,.18)';
  ctx.fillRect(0, 15, TILE, 1);
}

function rock(ctx) {
  ctx.fillStyle = C.rockDark;
  ctx.fillRect(3, 6, 10, 8);
  ctx.fillRect(2, 8, 12, 5);
  ctx.fillStyle = C.rock;
  ctx.fillRect(3, 6, 9, 6);
  ctx.fillRect(2, 8, 11, 4);
  ctx.fillStyle = C.rockLight;
  ctx.fillRect(4, 7, 4, 2);
  ctx.fillStyle = C.grassDark;
  ctx.fillRect(3, 13, 3, 1);
  ctx.fillRect(10, 13, 3, 1);
}

/** Buisson : petit obstacle rond, purement décoratif. */
function bush(ctx) {
  const cx = 7.5;
  const cy = 9;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot((x - cx) / 6.6, (y - cy) / 5.6);
      if (d > 1) continue;
      if (d > 0.84) ctx.fillStyle = C.leafEdge;
      else if (x - cx + (y - cy) < -3) ctx.fillStyle = C.leafLight;
      else if (y - cy > 2.5) ctx.fillStyle = C.leafDark;
      else ctx.fillStyle = C.leaf;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = 'rgba(30, 60, 35, .2)';
  ctx.fillRect(4, 15, 8, 1);
}

/** Gamelle de croquettes. */
function bowl(ctx) {
  ctx.fillStyle = 'rgba(40,30,40,.18)';
  ctx.fillRect(3, 13, 10, 2);
  ctx.fillStyle = '#c94b7a';
  ctx.fillRect(3, 9, 10, 5);
  ctx.fillStyle = '#f4a7bb';
  ctx.fillRect(4, 9, 8, 3);
  ctx.fillStyle = C.trunkDark;
  ctx.fillRect(5, 7, 6, 3);
  ctx.fillStyle = C.trunk;
  ctx.fillRect(6, 6, 4, 2);
  ctx.fillStyle = '#a9713f';
  ctx.fillRect(7, 5, 1, 1);
}

/* ------------------------------------------------------------- fabrique -- */

const cache = new Map();

function build(key, draw) {
  let cv = cache.get(key);
  if (!cv) {
    const made = makeCanvas(TILE, TILE);
    draw(made.ctx);
    cv = made.cv;
    cache.set(key, cv);
  }
  return cv;
}

/** Fond d'herbe (avec sa petite variante décorative). */
export function grassTile(x, y) {
  const roll = hash(x, y, 7);
  const variant = roll < 0.12 ? 1 : roll < 0.2 ? 2 : 0;
  const petal = roll > 0.94 ? C.petal[Math.floor(hash(x, y, 11) * C.petal.length)] : null;
  const key = `grass:${variant}:${petal ?? ''}`;
  return build(key, (ctx) => {
    grassBase(ctx, variant);
    if (petal) flower(ctx, petal);
  });
}

/** Parterre de fleurs explicite (caractère `f`). */
export function flowerTile(x, y) {
  const color = C.petal[Math.floor(hash(x, y, 3) * C.petal.length)];
  const second = C.petal[Math.floor(hash(x, y, 19) * C.petal.length)];
  return build(`flowers:${color}:${second}`, (ctx) => {
    grassBase(ctx, 0);
    flower(ctx, color, 4, 6);
    flower(ctx, second, 10, 9);
  });
}

/** Tuile de terrain auto-tuilée. */
export function terrainTile(ch, mask, frame = 0, variant = 0) {
  const spec = TERRAIN[ch];
  const animated = spec.kind === 'water';
  const key = `${spec.kind}:${mask}:${animated ? frame : variant}`;
  return build(key, (ctx) => {
    const grid = silhouette(mask, spec);
    switch (spec.kind) {
      case 'path':
        paintPath(ctx, grid);
        break;
      case 'water':
        paintWater(ctx, grid, frame);
        break;
      case 'blades':
        paintBlades(ctx, grid, variant);
        break;
      case 'canopy':
        paintCanopy(ctx, grid, mask, variant);
        break;
      default:
        break;
    }
  });
}

const OBJECTS = {
  H: wall,
  W: windowWall,
  h: (ctx) => roof(ctx, 1),
  R: (ctx) => roof(ctx, 0),
  D: door,
  P: terminal,
  S: sign,
  r: rock,
  b: bush,
  B: bowl,
};

/**
 * Objet posé sur l'herbe (ou tuile de bâtiment, opaque).
 * Pour un bâtiment, `dirs` contient 'l'/'r' quand le mur continue de ce côté :
 * les extrémités reçoivent alors une arête sombre, comme un vrai pignon.
 */
export function objectTile(ch, dirs = '') {
  if (ch === 'F') return build(`fence:${dirs}`, (ctx) => fence(ctx, dirs));
  const draw = OBJECTS[ch];
  if (!draw) return null;
  if (!OPAQUE.has(ch)) return build(`obj:${ch}`, draw);

  return build(`obj:${ch}:${dirs}`, (ctx) => {
    draw(ctx);
    ctx.fillStyle = 'rgba(60, 40, 45, .28)';
    if (!dirs.includes('l')) ctx.fillRect(0, 0, 1, TILE);
    if (!dirs.includes('r')) ctx.fillRect(TILE - 1, 0, 1, TILE);
    if (!dirs.includes('b')) {
      ctx.fillStyle = 'rgba(60, 40, 45, .22)';
      ctx.fillRect(0, TILE - 1, TILE, 1);
    }
  });
}

/** Ces objets couvrent toute la tuile : inutile de dessiner l'herbe dessous. */
export const OPAQUE = new Set(['H', 'W', 'h', 'R', 'D']);
