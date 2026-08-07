/**
 * Le monde qui tourne : déplacement du dresseur, chats sauvages qui vadrouillent,
 * rencontres, et rendu à 240×160 (la résolution d'une Game Boy Advance).
 */

import { TILE, hash } from './pixel.js';
import {
  MAP_W, MAP_H, VIEW_W, VIEW_H, START, SIGNS,
  tileAt, isSolid, isTallGrass, camera, drawMap, drawRustle,
} from './world.js';
import { heroSprite, catSprite, shadow } from './sprites.js';
import { direction, onPress, clearInput } from './input.js';
import { isOpen as dialogOpen, say } from './dialog.js';
import { encounter } from './encounter.js';
import { loadCats, getCat } from '../cats.js';
import { save, persist, isCaught } from './save.js';
import * as audio from './audio.js';

const STEP_MS = 155; // durée d'un pas du joueur
const CAT_STEP_MS = 220;
const WILD_MAX = 12; // chats présents sur la carte en même temps
const GRASS_RATE = 0.17; // probabilité de rencontre par pas dans les herbes
const WALKABLE_FOR_CATS = new Set(['.', '"', 'f', '=', '-']);

const DELTA = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

let ctx = null;
let active = false;
let busy = false; // une rencontre ou un dialogue est en cours
let onOpenBox = () => {};
let raf = 0;
let last = 0;
let time = 0;
let stepsSinceEncounter = 3;

const player = { tx: START.x, ty: START.y, dir: 'down', moving: null, t: 0, frame: 0, walked: 0 };
const wild = [];

/* ---------------------------------------------------------- démarrage --- */

export async function init(canvas, options = {}) {
  onOpenBox = options.onOpenBox ?? onOpenBox;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  await loadCats();

  player.tx = save.pos.x;
  player.ty = save.pos.y;
  player.dir = save.pos.dir;
  if (isSolid(player.tx, player.ty)) {
    player.tx = START.x;
    player.ty = START.y;
  }

  fillMap();
  onPress(handlePress);
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

export function setActive(value) {
  active = value;
  if (active) last = performance.now();
}

export function isBusy() {
  return busy;
}

/* --------------------------------------------------- chats sauvages ----- */

/** Identifiants encore à attraper. */
function remaining() {
  return Array.from({ length: 100 }, (_, i) => i + 1).filter(
    (id) => !isCaught(id) && !wild.some((w) => w.cat.id === id),
  );
}

function freeTile(x, y) {
  return WALKABLE_FOR_CATS.has(tileAt(x, y)) && !occupied(x, y);
}

function occupied(x, y) {
  if (player.tx === x && player.ty === y) return true;
  return wild.some((w) => (w.tx === x && w.ty === y) || (w.nx === x && w.ny === y));
}

/** Fait apparaître un chat, hors de vue si possible. */
function spawnCat(minDistance = 8) {
  const pool = remaining();
  if (!pool.length) return;
  const cat = getCat(pool[Math.floor(Math.random() * pool.length)]);

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
    const far = Math.abs(x - player.tx) + Math.abs(y - player.ty) >= minDistance;
    if (far && freeTile(x, y) && tileAt(x, y) !== '=') {
      wild.push({ cat, tx: x, ty: y, nx: x, ny: y, t: 1, wait: 600 + Math.random() * 2400, bob: 0 });
      return;
    }
  }
}

function fillMap() {
  while (wild.length < WILD_MAX && remaining().length) spawnCat(6);
}

function removeCat(entry) {
  const i = wild.indexOf(entry);
  if (i >= 0) wild.splice(i, 1);
  setTimeout(() => {
    if (wild.length < WILD_MAX) spawnCat();
  }, 1500);
}

function updateCats(dt) {
  for (const w of wild) {
    w.bob += dt;
    if (w.t < 1) {
      w.t = Math.min(1, w.t + dt / CAT_STEP_MS);
      if (w.t >= 1) {
        w.tx = w.nx;
        w.ty = w.ny;
      }
      continue;
    }
    w.wait -= dt;
    if (w.wait > 0) continue;
    w.wait = 800 + Math.random() * 3000;

    const dirs = Object.values(DELTA).sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const x = w.tx + dx;
      const y = w.ty + dy;
      if (freeTile(x, y)) {
        w.nx = x;
        w.ny = y;
        w.t = 0;
        break;
      }
    }
  }
}

/* ------------------------------------------------------- le dresseur ---- */

function facingTile() {
  const [dx, dy] = DELTA[player.dir];
  return { x: player.tx + dx, y: player.ty + dy };
}

function catAt(x, y) {
  return wild.find((w) => (w.tx === x && w.ty === y) || (w.nx === x && w.ny === y)) ?? null;
}

function updatePlayer(dt) {
  if (player.moving) {
    player.t += dt / STEP_MS;
    player.frame = 1 + (Math.floor(player.t * 2) % 2) * 2; // stepA / stepB
    if (player.t >= 1) {
      player.tx = player.moving.x;
      player.ty = player.moving.y;
      player.moving = null;
      player.t = 0;
      player.frame = 0;
      player.walked++;
      save.pos = { x: player.tx, y: player.ty, dir: player.dir };
      persist();
      if (player.walked % 2 === 0) audio.step();
      maybeGrassEncounter();
    }
    return;
  }

  const dir = direction();
  if (!dir) {
    player.frame = 0;
    return;
  }

  player.dir = dir;
  const [dx, dy] = DELTA[dir];
  const x = player.tx + dx;
  const y = player.ty + dy;

  // Pas de temps mort pour se retourner : une pression = un pas. Face à un
  // panneau ou à l'ordinateur, le pas est bloqué, donc on se contente de
  // pivoter — c'est exactement ce qu'il faut pour lire ou pour parler.
  const cat = catAt(x, y);
  if (cat) {
    startEncounter(cat);
    return;
  }
  if (isSolid(x, y) || x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;

  player.moving = { x, y };
  player.t = 0;
}

function maybeGrassEncounter() {
  stepsSinceEncounter++;
  if (!isTallGrass(player.tx, player.ty)) return;
  if (stepsSinceEncounter < 3) return;
  if (Math.random() > GRASS_RATE) return;

  const pool = remaining();
  if (!pool.length) return;
  const cat = getCat(pool[Math.floor(Math.random() * pool.length)]);
  startEncounter({ cat, wildOnMap: false });
}

async function startEncounter(entry) {
  if (busy) return;
  busy = true;
  stepsSinceEncounter = 0;
  clearInput();

  const result = await encounter(entry.cat);
  if (entry.wildOnMap !== false && (result === 'caught' || result === 'fled')) {
    removeCat(entry);
  } else if (entry.wildOnMap === false && result !== 'caught') {
    // le chat des herbes hautes repart dans la nature
  } else if (result === 'caught') {
    fillMap();
  }

  if (result === 'caught' && save.caught.length === 100) {
    await say([
      'Les 100 chats sont là !',
      'Le vallon est calme… et ta boîte est pleine de ronrons.',
      'Bravo, dresseur de chats !',
    ]);
  }
  busy = false;
}

/* ---------------------------------------------------------- action A ---- */

async function handlePress(button) {
  if (!active || busy || dialogOpen() || button !== 'a') return;
  const { x, y } = facingTile();

  const cat = catAt(x, y);
  if (cat) {
    startEncounter(cat);
    return;
  }

  const ch = tileAt(x, y);
  if (ch === 'P') {
    audio.blip();
    onOpenBox();
    return;
  }
  const lines = SIGNS[ch];
  if (lines) {
    busy = true;
    await say(lines);
    busy = false;
  }
}

/* ------------------------------------------------------------- rendu ---- */

function pixelPos(entity) {
  if (entity.moving) {
    const [dx, dy] = [entity.moving.x - entity.tx, entity.moving.y - entity.ty];
    return {
      x: (entity.tx + dx * entity.t) * TILE,
      y: (entity.ty + dy * entity.t) * TILE,
    };
  }
  return { x: entity.tx * TILE, y: entity.ty * TILE };
}

function catPos(w) {
  const t = Math.min(1, w.t);
  return {
    x: (w.tx + (w.nx - w.tx) * t) * TILE,
    y: (w.ty + (w.ny - w.ty) * t) * TILE,
  };
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(60, now - last);
  last = now;
  if (!active) return;
  time += dt;

  if (!busy && !dialogOpen()) {
    updatePlayer(dt);
    updateCats(dt);
  }

  const p = pixelPos(player);
  const cam = camera(p.x, p.y);

  drawMap(ctx, cam, time, 'ground');

  // personnages triés par profondeur : celui du bas passe devant
  const actors = [
    { y: p.y, draw: () => drawHero(cam, p) },
    ...wild.map((w) => {
      const pos = catPos(w);
      return { y: pos.y, draw: () => drawWild(cam, w, pos) };
    }),
  ].sort((a, b) => a.y - b.y);
  for (const actor of actors) actor.draw();

  drawMap(ctx, cam, time, 'over');
  drawRustle(ctx, cam, player.tx, player.ty);
}

function drawHero(cam, p) {
  const x = Math.round(p.x - cam.x);
  const y = Math.round(p.y - cam.y);
  shadow(ctx, x, y);
  ctx.drawImage(heroSprite(player.dir, player.frame), x, y);
}

function drawWild(cam, w, pos) {
  const x = Math.round(pos.x - cam.x);
  const y = Math.round(pos.y - cam.y);
  if (x < -TILE || y < -TILE || x > VIEW_W || y > VIEW_H) return;
  shadow(ctx, x, y);
  const bob = Math.floor(w.bob / 420 + hash(w.cat.id, 3, 9) * 2) % 2;
  ctx.drawImage(catSprite(w.cat, bob), x, y);
}

/** Recentre proprement après un retour depuis un autre écran. */
export function refresh() {
  fillMap();
  last = performance.now();
}

export function stop() {
  cancelAnimationFrame(raf);
}
