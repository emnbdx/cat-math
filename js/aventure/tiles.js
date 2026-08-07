/**
 * Le jeu de tuiles, dessiné en pixels au démarrage (16×16 chacune).
 *
 * Chaque caractère de la carte correspond à une tuile ; certaines ont
 * plusieurs images (eau animée) ou plusieurs variantes décoratives choisies
 * par la position (herbe).
 */

import { TILE, makeCanvas, hash } from './pixel.js';

const C = {
  grass: '#79c56a',
  grassDark: '#63b158',
  grassLight: '#93d67c',
  path: '#e6cfa4',
  pathDark: '#d2b487',
  sand: '#f0dcb0',
  water: '#4fa8de',
  waterDark: '#3d8ec4',
  waterLight: '#8fd3f0',
  trunk: '#8a5a3b',
  trunkDark: '#6b4529',
  leaf: '#3f9450',
  leafDark: '#2f7540',
  leafLight: '#5fb567',
  rock: '#a9a6ad',
  rockDark: '#807d86',
  wood: '#c08a55',
  woodDark: '#8f6238',
  roof: '#e05a52',
  roofDark: '#b73f3c',
  wall: '#f6e6cf',
  wallDark: '#d8bd9b',
  window: '#8fd3f0',
  ink: '#3d2f37',
  white: '#ffffff',
  pc: '#e9edf5',
  pcDark: '#aab6cc',
  screen: '#5fc7d8',
  petal: ['#ff9ec4', '#ffe066', '#ffffff', '#c8a2ff'],
};

/** Tuiles qui bloquent le passage. */
export const SOLID = new Set(['T', '~', 'H', 'h', 'D', 'F', 'r', 'S', 'P', 'W', 'B']);

/** Tuiles qui déclenchent des rencontres aléatoires. */
export const ENCOUNTER = new Set(['"']);

const tileset = new Map();

function fill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/* ------------------------------------------------------------- décors ---- */

function grassBase(ctx) {
  fill(ctx, 0, 0, TILE, TILE, C.grass);
  fill(ctx, 2, 3, 2, 1, C.grassDark);
  fill(ctx, 9, 6, 2, 1, C.grassLight);
  fill(ctx, 5, 11, 2, 1, C.grassDark);
  fill(ctx, 12, 13, 2, 1, C.grassLight);
}

function grassTuft(ctx) {
  fill(ctx, 4, 9, 1, 3, C.grassDark);
  fill(ctx, 5, 8, 1, 4, C.grassDark);
  fill(ctx, 6, 10, 1, 2, C.grassDark);
  fill(ctx, 10, 4, 1, 3, C.grassDark);
  fill(ctx, 11, 3, 1, 4, C.grassDark);
}

function grassFlower(ctx, color) {
  fill(ctx, 7, 9, 1, 3, C.grassDark);
  fill(ctx, 6, 7, 3, 1, color);
  fill(ctx, 7, 6, 1, 3, color);
  fill(ctx, 7, 7, 1, 1, '#ffe9a8');
}

function tallGrass(ctx, variant = 0) {
  grassBase(ctx);
  for (let i = 0; i < 5; i++) {
    const x = 1 + i * 3;
    const lift = (i + variant) % 2 ? 0 : 2; // touffes irrégulières
    fill(ctx, x, 7 - lift, 1, 8 + lift, C.leafDark);
    fill(ctx, x + 1, 5 - lift, 1, 10 + lift, C.leaf);
    fill(ctx, x + 2, 8 - lift, 1, 7 + lift, C.leafDark);
    fill(ctx, x + 1, 4 - lift, 1, 1, C.leafLight);
  }
}

function tree(ctx) {
  grassBase(ctx);
  fill(ctx, 6, 11, 4, 5, C.trunkDark);
  fill(ctx, 7, 11, 2, 5, C.trunk);
  // houppier
  fill(ctx, 3, 2, 10, 9, C.leaf);
  fill(ctx, 2, 4, 12, 5, C.leaf);
  fill(ctx, 4, 1, 8, 1, C.leaf);
  fill(ctx, 4, 3, 4, 3, C.leafLight);
  fill(ctx, 3, 8, 10, 2, C.leafDark);
  fill(ctx, 5, 10, 6, 1, C.leafDark);
}

function rock(ctx) {
  grassBase(ctx);
  fill(ctx, 5, 5, 6, 1, C.rockDark);
  fill(ctx, 4, 6, 8, 1, C.rock);
  fill(ctx, 3, 7, 10, 5, C.rock);
  fill(ctx, 2, 9, 12, 3, C.rock);
  fill(ctx, 5, 6, 3, 2, '#c5c2c9');
  fill(ctx, 3, 11, 10, 1, C.rockDark);
  fill(ctx, 2, 12, 12, 1, C.rockDark);
  fill(ctx, 4, 13, 9, 1, '#5d8a52');
}

function path(ctx) {
  fill(ctx, 0, 0, TILE, TILE, C.path);
  fill(ctx, 3, 2, 2, 1, C.pathDark);
  fill(ctx, 10, 5, 2, 1, C.pathDark);
  fill(ctx, 6, 12, 2, 1, C.pathDark);
}

function water(ctx, frame) {
  fill(ctx, 0, 0, TILE, TILE, C.water);
  fill(ctx, 0, 4, TILE, 1, C.waterDark);
  fill(ctx, 0, 12, TILE, 1, C.waterDark);
  const o = frame * 5;
  fill(ctx, (2 + o) % 16, 2, 3, 1, C.waterLight);
  fill(ctx, (9 + o) % 16, 7, 4, 1, C.waterLight);
  fill(ctx, (5 + o) % 16, 10, 3, 1, C.waterLight);
  fill(ctx, (12 + o) % 16, 14, 2, 1, C.waterLight);
}

function shore(ctx) {
  fill(ctx, 0, 0, TILE, TILE, C.sand);
  fill(ctx, 2, 4, 2, 1, C.pathDark);
  fill(ctx, 11, 9, 2, 1, C.pathDark);
}

/**
 * Barrière. `dirs` dit dans quels sens elle se prolonge ('h', 'v' ou les deux) :
 * sans ça, les côtés d'un enclos ressembleraient à des planches volantes.
 */
function fence(ctx, dirs = 'h') {
  grassBase(ctx);
  const horizontal = dirs.includes('h');
  const vertical = dirs.includes('v');

  if (horizontal) {
    fill(ctx, 0, 6, TILE, 2, C.wood);
    fill(ctx, 0, 11, TILE, 2, C.wood);
  }
  if (vertical) {
    fill(ctx, 5, 0, 2, TILE, C.wood);
    fill(ctx, 10, 0, 2, TILE, C.wood);
  }
  if (horizontal) {
    // poteaux debout, aux deux bouts
    fill(ctx, 2, 3, 2, 12, C.woodDark);
    fill(ctx, 12, 3, 2, 12, C.woodDark);
    fill(ctx, 2, 3, 2, 1, '#d9a878');
    fill(ctx, 12, 3, 2, 1, '#d9a878');
  } else if (vertical) {
    // traverse, pour que la clôture « rentre » dans le décor
    fill(ctx, 4, 3, 9, 2, C.woodDark);
    fill(ctx, 4, 12, 9, 2, C.woodDark);
  }
}

function sign(ctx) {
  grassBase(ctx);
  fill(ctx, 7, 9, 2, 6, C.woodDark);
  fill(ctx, 2, 2, 12, 8, C.woodDark);
  fill(ctx, 3, 3, 10, 6, C.wood);
  fill(ctx, 4, 5, 8, 1, C.woodDark);
  fill(ctx, 4, 7, 6, 1, C.woodDark);
}

function wall(ctx) {
  fill(ctx, 0, 0, TILE, TILE, C.wall);
  fill(ctx, 0, 7, TILE, 1, C.wallDark);
  fill(ctx, 0, 15, TILE, 1, C.wallDark);
  fill(ctx, 5, 0, 1, 7, C.wallDark);
  fill(ctx, 11, 8, 1, 7, C.wallDark);
}

function windowWall(ctx) {
  wall(ctx);
  fill(ctx, 3, 3, 10, 9, C.ink);
  fill(ctx, 4, 4, 8, 7, C.window);
  fill(ctx, 5, 5, 3, 2, C.white);
  fill(ctx, 8, 4, 1, 7, C.ink);
  fill(ctx, 4, 7, 8, 1, C.ink);
}

function roof(ctx) {
  fill(ctx, 0, 0, TILE, TILE, C.roof);
  fill(ctx, 0, 0, TILE, 3, C.roofDark);
  fill(ctx, 0, 8, TILE, 1, C.roofDark);
  fill(ctx, 4, 4, 1, 4, C.roofDark);
  fill(ctx, 12, 10, 1, 5, C.roofDark);
  fill(ctx, 0, 15, TILE, 1, C.roofDark);
}

function door(ctx) {
  fill(ctx, 0, 0, TILE, TILE, C.wall);
  fill(ctx, 2, 1, 12, 15, C.woodDark);
  fill(ctx, 3, 2, 10, 14, C.wood);
  fill(ctx, 10, 8, 2, 2, C.ink);
  fill(ctx, 3, 6, 10, 1, C.woodDark);
}

/** Le « PC » : c'est lui qui ouvre la boîte à chats. */
function terminal(ctx) {
  grassBase(ctx);
  fill(ctx, 2, 2, 12, 12, C.ink);
  fill(ctx, 3, 3, 10, 10, C.pc);
  fill(ctx, 4, 4, 8, 6, C.ink);
  fill(ctx, 5, 5, 6, 4, C.screen);
  fill(ctx, 6, 6, 2, 1, C.white);
  fill(ctx, 4, 11, 3, 1, C.pcDark);
  fill(ctx, 9, 11, 3, 1, C.pcDark);
  fill(ctx, 2, 14, 12, 2, C.ink);
}

/** Bac à croquettes : purement décoratif. */
function bowl(ctx) {
  grassBase(ctx);
  fill(ctx, 3, 8, 10, 5, C.ink);
  fill(ctx, 4, 9, 8, 3, '#f4a7bb');
  fill(ctx, 5, 8, 6, 2, '#8a5a3b');
  fill(ctx, 6, 7, 1, 1, '#a9713f');
  fill(ctx, 9, 7, 1, 1, '#a9713f');
}

const BUILDERS = {
  '.': grassBase,
  '"': tallGrass,
  T: tree,
  r: rock,
  '=': path,
  '-': shore,
  F: fence,
  S: sign,
  H: wall,
  W: windowWall,
  h: roof,
  D: door,
  P: terminal,
  B: bowl,
};

/** Construit toutes les tuiles (+ 3 images pour l'eau). */
export function buildTileset() {
  if (tileset.size) return tileset;

  for (const [ch, draw] of Object.entries(BUILDERS)) {
    const { cv, ctx } = makeCanvas(TILE, TILE);
    draw(ctx);
    tileset.set(ch, [cv]);
  }

  // herbe : 8 variantes, dont peu de fleurs — sinon le pré vire au confetti
  const decor = [null, null, null, 'tuft', null, 'flower0', null, 'flower1'];
  tileset.set(
    '.',
    decor.map((kind) => {
      const { cv, ctx } = makeCanvas(TILE, TILE);
      grassBase(ctx);
      if (kind === 'tuft') grassTuft(ctx);
      if (kind === 'flower0') grassFlower(ctx, C.petal[0]);
      if (kind === 'flower1') grassFlower(ctx, C.petal[1]);
      return cv;
    }),
  );

  // barrières : 3 orientations, choisies par le voisinage (voir world.js)
  for (const dirs of ['h', 'v', 'hv']) {
    const { cv, ctx } = makeCanvas(TILE, TILE);
    fence(ctx, dirs);
    tileset.set(`F${dirs}`, [cv]);
  }

  // hautes herbes : 2 touffes différentes, pour éviter l'effet papier peint
  const blades = [];
  for (let i = 0; i < 2; i++) {
    const { cv, ctx } = makeCanvas(TILE, TILE);
    tallGrass(ctx, i);
    blades.push(cv);
  }
  tileset.set('"', blades);

  const waves = [];
  for (let f = 0; f < 3; f++) {
    const { cv, ctx } = makeCanvas(TILE, TILE);
    water(ctx, f);
    waves.push(cv);
  }
  tileset.set('~', waves);

  // fleurs plantées explicitement sur la carte
  const flowers = [];
  for (const color of C.petal) {
    const { cv, ctx } = makeCanvas(TILE, TILE);
    grassBase(ctx);
    grassFlower(ctx, color);
    flowers.push(cv);
  }
  tileset.set('f', flowers);

  return tileset;
}

/** Image à afficher pour une tuile donnée, à un instant donné. */
export function tileImage(ch, x, y, time) {
  const frames = tileset.get(ch) ?? tileset.get('.');
  if (frames.length === 1) return frames[0];
  if (ch === '~') return frames[Math.floor(time / 380) % frames.length];
  return frames[Math.floor(hash(x, y, 7) * frames.length)];
}
