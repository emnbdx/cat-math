/**
 * La carte : « le Vallon des chats ».
 *
 * Un caractère = une tuile de 16×16 px (voir `tiles.js` pour la légende).
 *   .  herbe      "  hautes herbes    =  chemin      -  sable
 *   T  arbre      r  rocher           F  barrière    f  fleur
 *   h  toit       H  mur              W  fenêtre     D  porte
 *   ~  eau        S  panneau          P  ordinateur  B  gamelle
 */

import { TILE } from './pixel.js';
import { SOLID, ENCOUNTER, buildTileset, tileImage } from './tiles.js';
import { rustle } from './sprites.js';

export const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T......................................T',
  'T..hhhhhh..............................T',
  'T..hhhhhh..................----------..T',
  'T..HWHDHH.................-~~~~~~~~-...T',
  'T.....=...................-~~~~~~~~-...T',
  'T..f..=.B.................-~~~~~~~~-...T',
  'T.....=...................-~~~~~~~~-...T',
  'T.FFFF=FFF................-~~~~~~~~-...T',
  'T.F.P.=..F................-~~~~~~~~-...T',
  'T.F......F................-~~~~~~~~-...T',
  'T.FFFF=FFF................----------...T',
  'T.....=................................T',
  'T.....=......f............f............T',
  'T=====================================.T',
  'T...................=..................T',
  'T...................=.S................T',
  'T...................=..................T',
  'T.""""""""""........=..................T',
  'T.""""""""""........=....."""""""""....T',
  'T.""""""""""........=....."""""""""....T',
  'T.""""""""""........=....."""""""""....T',
  'T.""""""""""".r.....=....."""""""""....T',
  'T.""""""""""........=....."""""""""....T',
  'T...................=..................T',
  'T.........f.........=..........f.......T',
  'T...................=..................T',
  'T......................................T',
  'T......................................T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];

export const MAP_W = MAP[0].length;
export const MAP_H = MAP.length;

/** Résolution interne, façon Game Boy Advance. */
export const VIEW_W = 240;
export const VIEW_H = 160;

/** Départ du joueur : sur le chemin, devant la maison. */
export const START = { x: 6, y: 12 };

export function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 'T';
  return MAP[y][x];
}

export function isSolid(x, y) {
  return SOLID.has(tileAt(x, y));
}

export function isTallGrass(x, y) {
  return ENCOUNTER.has(tileAt(x, y));
}

/** Messages des décors avec lesquels on peut interagir. */
export const SIGNS = {
  D: ['La porte est fermée à clé.', 'Une petite pancarte : « Parti nourrir les chats, je reviens ! »'],
  S: ['PANNEAU : Vallon des chats.', 'Attention, des chats sauvages se cachent dans les hautes herbes !'],
  B: ['Une gamelle de croquettes.', 'Elle est encore pleine… quelqu’un s’en occupe bien.'],
  F: ['Une barrière en bois.'],
  r: ['Un gros rocher tout rond. Idéal pour la sieste.'],
  T: ['Un arbre. Il y a des traces de griffes sur le tronc.'],
  '~': ['De l’eau bien fraîche. Les chats préfèrent la regarder de loin.'],
  H: ['Le mur de la maison.'],
  W: ['Par la fenêtre, on voit des coussins partout.'],
  h: ['Le toit de la maison.'],
};

/* ------------------------------------------------------------- rendu ----- */

/** Caméra centrée sur le joueur, bloquée aux bords de la carte. */
export function camera(px, py) {
  const max = { x: MAP_W * TILE - VIEW_W, y: MAP_H * TILE - VIEW_H };
  return {
    x: Math.max(0, Math.min(max.x, Math.round(px + TILE / 2 - VIEW_W / 2))),
    y: Math.max(0, Math.min(max.y, Math.round(py + TILE / 2 - VIEW_H / 2))),
  };
}

/**
 * Certaines tuiles changent d'image selon leurs voisines : une barrière doit
 * savoir si elle court à l'horizontale, à la verticale, ou les deux.
 */
function tileKey(ch, x, y) {
  if (ch !== 'F') return ch;
  const h = tileAt(x - 1, y) === 'F' || tileAt(x + 1, y) === 'F';
  const v = tileAt(x, y - 1) === 'F' || tileAt(x, y + 1) === 'F';
  if (h && v) return 'Fhv';
  return v ? 'Fv' : 'Fh';
}

/** Dessine le décor visible. `layer` : 'ground' (sol) ou 'over' (au-dessus). */
export function drawMap(ctx, cam, time, layer) {
  buildTileset();
  const x0 = Math.floor(cam.x / TILE);
  const y0 = Math.floor(cam.y / TILE);
  const x1 = Math.ceil((cam.x + VIEW_W) / TILE);
  const y1 = Math.ceil((cam.y + VIEW_H) / TILE);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ch = tileAt(x, y);
      const dx = x * TILE - cam.x;
      const dy = y * TILE - cam.y;

      if (layer === 'ground') {
        ctx.drawImage(tileImage(tileKey(ch, x, y), x, y, time), dx, dy);
        continue;
      }
      // Les hautes herbes repassent par-dessus les personnages, mais seulement
      // sur leur moitié basse : on voit encore la tête du chat qui s'y cache.
      if (ch === '"') {
        const img = tileImage(ch, x, y, time);
        ctx.drawImage(img, 0, TILE / 2, TILE, TILE / 2, dx, dy + TILE / 2, TILE, TILE / 2);
      }
    }
  }
}

/** Frémissement des herbes sous les pieds d'un personnage. */
export function drawRustle(ctx, cam, tx, ty) {
  if (!isTallGrass(tx, ty)) return;
  rustle(ctx, tx * TILE - cam.x, ty * TILE - cam.y);
}
