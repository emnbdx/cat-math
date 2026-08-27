/**
 * La mini-carte de l'écran du bas : le vallon vu de haut, 2 px par tuile,
 * avec la position du dresseur qui clignote.
 */

import { MAP, MAP_W, MAP_H } from './world.js';
import { makeCanvas } from './pixel.js';

const PX = 2;

const COLORS = {
  '.': '#8fd07f',
  f: '#a9df8f',
  '"': '#4f9f52',
  '=': '#e3c495',
  '~': '#66b8e6',
  T: '#3c7f4a',
  b: '#3c7f4a',
  r: '#b0adb6',
  F: '#c58c56',
  S: '#c58c56',
  P: '#7fd3e0',
  B: '#f4a7bb',
  R: '#e2635a',
  h: '#e2635a',
  H: '#f7e9d2',
  W: '#8fd6f2',
  D: '#8c5f36',
};

let base = null;
let view = null;
let blink = 0;

/** Le fond ne change jamais : on le dessine une seule fois. */
function buildBase() {
  if (base) return base;
  const { cv, ctx } = makeCanvas(MAP_W * PX, MAP_H * PX);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      ctx.fillStyle = COLORS[MAP[y][x]] ?? COLORS['.'];
      ctx.fillRect(x * PX, y * PX, PX, PX);
    }
  }
  base = cv;
  return base;
}

export function attach(canvas) {
  view = canvas.getContext('2d');
  view.imageSmoothingEnabled = false;
  canvas.width = MAP_W * PX;
  canvas.height = MAP_H * PX;
}

/** Redessine la carte avec le dresseur (`tile` = { x, y }). */
export function draw(tile) {
  if (!view) return;
  view.drawImage(buildBase(), 0, 0);

  blink = (blink + 1) % 2;
  view.fillStyle = blink ? '#ffffff' : '#e2504a';
  view.fillRect(tile.x * PX - 1, tile.y * PX - 1, PX + 2, PX + 2);
  view.fillStyle = '#2a3550';
  view.fillRect(tile.x * PX - 2, tile.y * PX - 2, PX + 4, 1);
  view.fillRect(tile.x * PX - 2, tile.y * PX + PX + 1, PX + 4, 1);
  view.fillRect(tile.x * PX - 2, tile.y * PX - 2, 1, PX + 4);
  view.fillRect(tile.x * PX + PX + 1, tile.y * PX - 2, 1, PX + 4);
}
