/**
 * La carte : « le Vallon des chats », 46 × 38 tuiles.
 *
 * Un caractère = une tuile de 16×16 px. Les terrains (`= " ~ T`) sont
 * auto-tuilés par `tiles.js` : leur dessin dépend des voisines, donc les
 * contours sont arrondis et les bosquets se rejoignent.
 *
 *   .  herbe        "  hautes herbes   =  chemin       ~  eau
 *   T  arbre        b  buisson         r  rocher       f  fleurs
 *   F  barrière     S  panneau         P  ordinateur   B  gamelle
 *   R  faîtage      h  toit            H  mur          W  fenêtre   D  porte
 */

import { TILE, hash } from './pixel.js';
import {
  SOLID, ENCOUNTER, OPAQUE, isTerrain, grassTile, flowerTile, terrainTile, objectTile,
} from './tiles.js';
import { rustle } from './sprites.js';

export const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTT....TTTTTTTTTTT....TTTTTTTTTTTT',
  'TTTTTRRRRRRRR........TTTTTTTT............TTTTT',
  'TTTTThhhhhhhh.........TTTTT................TTT',
  'TTT..hhhhhhhh..........""".................TTT',
  'TTT..HWHDHHWH...TTTT."""""""...............TTT',
  'TTT.....==......TTTTT"""""""...............TTT',
  'TT....f.==.b.....TTTT"""""""..............TTTT',
  'TT......==........T....""""...r~~~~~......TTTT',
  'TT..FFFF==FFFF...............~~~~~~~~~....TTTT',
  'TT..F...==...F..............~~~~~~~~~~~...TTTT',
  'TT..F...==.B.F..............~~~~~~~~~~~...TTTT',
  'TTT.F.P.==...F..............~~~~~~~~~~~...TTTT',
  'TTT.F.f.==.ffF..b............~~~~~~~~~....TbTT',
  'TTT.F...==...F....TTT...==....~~~~.~RRRRRRTTTT',
  'TTTTFFFF==FFFF...TTTT...==..........hhhhhhTTTT',
  'TTTT....==........TTT...==..........hhhhhh.TTT',
  'TTTT...b==..r...........==..........HWDHWH.TTT',
  'TTTT....==Sf.......br...==.b...b...f..=.....TT',
  'TTTT======================================.fTT',
  'TTTT======================================..TT',
  'TTTT..........==S................==.........TT',
  'TTT...""""""".==f..........f.r.""=="""".....TT',
  'TTT.."""""""""==.............."""=="""""..T.TT',
  'TTT.""""""""""==.............."""==""""""TTTTT',
  'TT..""""""""""==.............""""==""""""TTTTT',
  'TT..""""""""""==.............."""=="""""TTTTTT',
  'TT..."""""""""==.............."""==""""..T.TTT',
  'TT....""""""".==.r.............""=="".....TTTT',
  'TT............==.....b...........==.......TTTT',
  'TTT...........=====================....b..TTTT',
  'TTTT.......TTTT====================TT.....TTTT',
  'TTTTT....TTTTTTTTTTTT.....TTTTTTTTTTTT....TTTT',
  'TTTTTTTTTTTTTTTTTTTfTTTrTTTTTTTTTTTTfTT.TTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];

export const MAP_W = MAP[0].length;
export const MAP_H = MAP.length;

/** Résolution interne : celle d'un écran de Nintendo DS. */
export const VIEW_W = 256;
export const VIEW_H = 192;

/** Départ du joueur : sur le chemin, devant la maison. */
export const START = { x: 8, y: 19 };

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
  D: ['La porte est fermée à clé.', 'Un petit mot est punaisé : « Parti nourrir les chats, je reviens ! »'],
  S: ['PANNEAU : Vallon des chats.', 'Des chats sauvages se cachent dans les hautes herbes. Ouvre l’œil !'],
  B: ['Une gamelle de croquettes.', 'Elle est encore pleine… quelqu’un s’en occupe bien.'],
  F: ['Une barrière en bois toute simple.'],
  r: ['Un gros rocher tout rond. Idéal pour la sieste.'],
  b: ['Un buisson bien touffu. Quelque chose a bougé dedans… ou pas.'],
  T: ['Un arbre. Il y a des traces de griffes sur le tronc.'],
  '~': ['De l’eau bien fraîche. Les chats préfèrent la regarder de loin.'],
  H: ['Le mur de la maison.'],
  W: ['Par la fenêtre, on voit des coussins partout.'],
  h: ['Le toit de la maison.'],
  R: ['Le toit de la maison.'],
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

/** Voisinage d'une tuile de terrain, encodé sur 8 bits (N, NE, E, SE…). */
function neighbourMask(ch, x, y) {
  const same = (dx, dy) => (tileAt(x + dx, y + dy) === ch ? 1 : 0);
  return (
    same(0, -1) * 1 +
    same(1, -1) * 2 +
    same(1, 0) * 4 +
    same(1, 1) * 8 +
    same(0, 1) * 16 +
    same(-1, 1) * 32 +
    same(-1, 0) * 64 +
    same(-1, -1) * 128
  );
}

/** Côtés où le bâtiment se prolonge : 'l', 'r', 'b'. */
function buildingEdges(x, y) {
  const part = (dx, dy) => (OPAQUE.has(tileAt(x + dx, y + dy)) ? 1 : 0);
  return `${part(-1, 0) ? 'l' : ''}${part(1, 0) ? 'r' : ''}${part(0, 1) ? 'b' : ''}`;
}

/** Orientation d'une barrière, d'après ses voisines. */
function fenceDirs(x, y) {
  const h = tileAt(x - 1, y) === 'F' || tileAt(x + 1, y) === 'F';
  const v = tileAt(x, y - 1) === 'F' || tileAt(x, y + 1) === 'F';
  if (h && v) return 'hv';
  return v ? 'v' : 'h';
}

/** Dessine le décor visible. `layer` : 'ground' (sol) ou 'over' (au-dessus). */
export function drawMap(ctx, cam, time, layer) {
  const frame = Math.floor(time / 420) % 3;
  const x0 = Math.floor(cam.x / TILE);
  const y0 = Math.floor(cam.y / TILE);
  const x1 = Math.ceil((cam.x + VIEW_W) / TILE);
  const y1 = Math.ceil((cam.y + VIEW_H) / TILE);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ch = tileAt(x, y);
      const dx = x * TILE - cam.x;
      const dy = y * TILE - cam.y;

      // Les hautes herbes repassent par-dessus les personnages, mais seulement
      // sur leur moitié basse : on voit encore la tête du chat qui s'y cache.
      if (layer === 'over') {
        if (ch !== '"') continue;
        const img = terrainTile(ch, neighbourMask(ch, x, y), frame);
        ctx.drawImage(img, 0, TILE / 2, TILE, TILE / 2, dx, dy + TILE / 2, TILE, TILE / 2);
        continue;
      }

      if (OPAQUE.has(ch)) {
        ctx.drawImage(objectTile(ch, buildingEdges(x, y)), dx, dy);
        continue;
      }

      ctx.drawImage(ch === 'f' ? flowerTile(x, y) : grassTile(x, y), dx, dy);

      if (isTerrain(ch)) {
        const variant = Math.floor(hash(x, y, 5) * 4);
        ctx.drawImage(terrainTile(ch, neighbourMask(ch, x, y), frame, variant), dx, dy);
        continue;
      }
      const obj = objectTile(ch, ch === 'F' ? fenceDirs(x, y) : '');
      if (obj) ctx.drawImage(obj, dx, dy);
    }
  }
}

/** Frémissement des herbes sous les pieds d'un personnage. */
export function drawRustle(ctx, cam, tx, ty) {
  if (!isTallGrass(tx, ty)) return;
  rustle(ctx, tx * TILE - cam.x, ty * TILE - cam.y);
}
