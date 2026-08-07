/**
 * Sprites du monde : le dresseur (4 directions, cycle de marche) et les chats
 * sauvages, colorés avec la palette de `data/cats.json` — chaque chat de la
 * collection a donc son propre sprite sur la carte.
 */

import { makeCanvas, drawGrid, mirror } from './pixel.js';

/* ═════════════════════════════════════════════════════ le dresseur ═══ */

const HERO = {
  o: '#33262f', // contour
  c: '#e2504a', // casquette
  C: '#b93a37', // visière
  s: '#f7c9a4', // peau
  e: '#33262f', // yeux
  j: '#f4f1ec', // veste
  b: '#3f6fb5', // pantalon
  k: '#4a4550', // chaussures
  p: '#f2c14e', // sac à dos
  H: '#5b3f33', // cheveux
};

// moitié gauche (8 px), symétrique → 16 px de large
const HERO_DOWN = mirror([
  '........',
  '...ooo..',
  '..occcc.',
  '.occcccc',
  '.oCCCCCC',
  '.oHsssss',
  '.ossesss',
  '.ossssss',
  '..oooooo',
  '.pojjjjj',
  '.pojjjjj',
  '..ojjjjj',
  '..obbbbb',
  '..obbbbb',
]);

const HERO_UP = mirror([
  '........',
  '...ooo..',
  '..occcc.',
  '.occcccc',
  '.occcccc',
  '.oHHHHHH',
  '.oHHHHHH',
  '.oHHHHHH',
  '..oooooo',
  '..ojjjjj',
  '..ojpppp',
  '..ojpppp',
  '..obbbbb',
  '..obbbbb',
]);

const HERO_SIDE = [
  '................',
  '....ooooo.......',
  '...occccco......',
  '..occccccco.....',
  '..oCCCCCCCo.....',
  '..osssssso......',
  '..ossesso.......',
  '..ossssso.......',
  '..oooooooo......',
  '..opjjjjjo......',
  '..opjjjjjo......',
  '..opjjjjo.......',
  '...objjbo.......',
  '...obbbbo.......',
];

const LEGS = {
  stand: ['..okkk....kkko..', '..okkk....kkko..'],
  stepA: ['..okkk....kkko..', '...kkk..........'],
  stepB: ['..okkk....kkko..', '..........kkk...'],
};

const LEGS_SIDE = {
  stand: ['...okkkkko......', '...okkkkko......'],
  stepA: ['..okkk.kkko.....', '..okk...okk.....'],
  stepB: ['...okkkkko......', '....okkko.......'],
};

const hero = new Map();

function buildHero() {
  if (hero.size) return;
  const cycles = ['stand', 'stepA', 'stand', 'stepB'];

  for (const [dir, grid, side] of [
    ['down', HERO_DOWN, false],
    ['up', HERO_UP, false],
    ['right', HERO_SIDE, true],
    ['left', HERO_SIDE, true],
  ]) {
    const frames = cycles.map((step) => {
      const { cv, ctx } = makeCanvas(16, 16);
      const flip = dir === 'left';
      drawGrid(ctx, grid, HERO, 0, 0, flip);
      const legs = side ? LEGS_SIDE[step] : LEGS[step];
      drawGrid(ctx, legs, HERO, 0, 14, flip);
      return cv;
    });
    hero.set(dir, frames);
  }
}

export function heroSprite(dir, frame) {
  buildHero();
  const frames = hero.get(dir) ?? hero.get('down');
  return frames[frame % frames.length];
}

/* ══════════════════════════════════════════════════ les chats ═══════ */

// chat assis, vu de face : grosses oreilles, gros yeux, petites pattes
const CAT = [
  '................',
  '..oo........oo..',
  '.opfo......ofpo.',
  '.offfoooooofffo.',
  'offffffffffffffo',
  'offffffffffffffo',
  'offeeffffffeeffo',
  'offeeffffffeeffo',
  'offffffppffffffo',
  '.offffffffffffo.',
  '..offffffffffo..',
  '..offffffffffo..',
  '.offffffffffffo.',
  'offffffffffffffo',
  'offwwffffffwwffo',
  '.oooooooooooooo.',
];

const cache = new Map();

/**
 * Sprite d'un chat, teinté par sa palette et son motif.
 * `frame` 0/1 : petit rebond d'inactivité.
 */
export function catSprite(cat, frame = 0) {
  const key = `${cat.id}:${frame}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const { palette, pattern } = cat.svg;
  const pal = {
    o: '#4a3b44',
    f: palette.fur,
    a: palette.accent,
    p: palette.blush,
    e: '#33262f',
    w: '#fffaf6',
  };

  const { cv, ctx } = makeCanvas(16, 16);
  const dy = frame === 1 ? 1 : 0;

  // la queue, derrière le corps : elle bat doucement d'une image à l'autre
  ctx.fillStyle = '#4a3b44';
  ctx.fillRect(14, 10 + dy, 2, 3);
  ctx.fillRect(15, 8 - frame + dy, 1, 3);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(14, 11 + dy, 1, 2);
  ctx.fillRect(15, 9 - frame + dy, 1, 2);

  drawGrid(ctx, CAT, pal, 0, dy);
  paintPattern(ctx, pattern, pal, dy);

  // museau : redessiné après le motif, qui peut passer par-dessus
  ctx.fillStyle = pal.p;
  ctx.fillRect(7, 8 + dy, 2, 1);

  // reflets dans les yeux : c'est ce qui rend le regard kawaii
  ctx.fillStyle = '#fff';
  ctx.fillRect(3, 6 + dy, 1, 1);
  ctx.fillRect(11, 6 + dy, 1, 1);
  // petites joues roses
  ctx.fillStyle = palette.blush;
  ctx.fillRect(2, 8 + dy, 1, 1);
  ctx.fillRect(13, 8 + dy, 1, 1);

  cache.set(key, cv);
  return cv;
}

function paintPattern(ctx, pattern, pal, dy) {
  ctx.fillStyle = pal.a;
  switch (pattern) {
    case 'tabby': // rayures sur le front et sur le dos
      ctx.fillRect(5, 4 + dy, 1, 2);
      ctx.fillRect(7, 4 + dy, 1, 1);
      ctx.fillRect(8, 4 + dy, 1, 1);
      ctx.fillRect(10, 4 + dy, 1, 2);
      ctx.fillRect(3, 12 + dy, 3, 1);
      ctx.fillRect(10, 12 + dy, 3, 1);
      break;
    case 'spots':
      ctx.fillRect(4, 4 + dy, 2, 2);
      ctx.fillRect(10, 5 + dy, 2, 2);
      ctx.fillRect(4, 12 + dy, 2, 2);
      break;
    case 'patch': // grosse tache sur un côté de la tête
      ctx.fillRect(9, 4 + dy, 5, 3);
      ctx.fillRect(10, 7 + dy, 4, 2);
      break;
    case 'points': // oreilles et museau plus foncés (type siamois)
      ctx.fillRect(2, 2 + dy, 1, 2);
      ctx.fillRect(3, 3 + dy, 1, 1);
      ctx.fillRect(13, 2 + dy, 1, 2);
      ctx.fillRect(12, 3 + dy, 1, 1);
      ctx.fillRect(6, 8 + dy, 4, 2);
      break;
    case 'bicolour': // plastron blanc
      ctx.fillStyle = pal.w;
      ctx.fillRect(5, 11 + dy, 6, 3);
      ctx.fillRect(6, 9 + dy, 4, 2);
      break;
    default:
      break;
  }
}

/* ═════════════════════════════════════════════════ divers ══════════ */

/** Petite ombre sous les personnages. */
export function shadow(ctx, x, y) {
  ctx.fillStyle = 'rgba(40, 30, 40, .22)';
  ctx.fillRect(x + 4, y + 14, 8, 2);
  ctx.fillRect(x + 3, y + 15, 10, 1);
}

/** Herbes qui frémissent quand quelqu'un les traverse. */
export function rustle(ctx, x, y) {
  ctx.fillStyle = '#3f9450';
  ctx.fillRect(x + 2, y + 11, 12, 2);
  ctx.fillStyle = '#5fb567';
  ctx.fillRect(x + 3, y + 10, 3, 2);
  ctx.fillRect(x + 10, y + 10, 3, 2);
}
