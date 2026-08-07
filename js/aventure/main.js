/**
 * Point d'entrée de l'aventure : mise à l'échelle de l'écran, barre du bas
 * (Jouer / Collection / Réglages) et branchement des boutons tactiles.
 *
 * Cette page est indépendante du jeu principal : elle ne partage que le
 * catalogue de chats (`data/cats.json` + `js/cats.js`).
 */

import { VIEW_W, VIEW_H } from './world.js';
import * as game from './game.js';
import * as dex from './dex.js';
import { bindButton, onPress } from './input.js';
import { save, persist, reset } from './save.js';
import { blip } from './audio.js';
import { isOpen as dialogOpen } from './dialog.js';

const screen = document.getElementById('screen');
const canvas = document.getElementById('view');
const views = new Map(
  [...document.querySelectorAll('[data-view]')].map((el) => [el.dataset.view, el]),
);
const tabs = [...document.querySelectorAll('[data-tab]')];
const counter = document.getElementById('hud-count');

let current = 'game';

/* ------------------------------------------------------ mise à l'échelle */

/**
 * On privilégie un facteur entier : c'est ce qui donne des pixels bien carrés.
 * En dessous de ×2 (petits téléphones), on autorise les demis pour ne pas
 * gâcher la moitié de l'écran.
 */
function fit() {
  const wrap = screen.parentElement;
  const top = wrap.getBoundingClientRect().top;
  const available = {
    w: wrap.clientWidth,
    h: Math.max(160, window.innerHeight - top - 150),
  };
  const raw = Math.min(available.w / VIEW_W, available.h / VIEW_H);
  const scale = raw >= 2 ? Math.floor(raw) : Math.max(0.9, Math.round(raw * 20) / 20);
  document.documentElement.style.setProperty('--scale', scale);
}

/* -------------------------------------------------------------- écrans -- */

function show(name) {
  if (name === current) return;
  if (current === 'box') dex.close();
  current = name;

  for (const [key, el] of views) el.hidden = key !== name;
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));

  game.setActive(name === 'game');
  if (name === 'game') game.refresh();
  if (name === 'box') dex.open();
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    // une conversation (ou une rencontre) en cours se termine d'abord
    if (dialogOpen() || game.isBusy()) return;
    blip();
    show(tab.dataset.tab);
  });
}

// B ramène toujours au jeu
onPress((button) => {
  if (button === 'b' && current !== 'game' && !dialogOpen()) show('game');
});

/* ------------------------------------------------------------ réglages -- */

const soundBox = document.getElementById('set-sound');
soundBox.checked = save.sound;
soundBox.addEventListener('change', () => {
  save.sound = soundBox.checked;
  persist();
  if (save.sound) blip();
});

document.getElementById('set-reset').addEventListener('click', () => {
  if (!confirm('Effacer toute l’aventure (chats capturés et position) ?')) return;
  reset();
  location.reload();
});

/* ---------------------------------------------------------- démarrage --- */

for (const el of document.querySelectorAll('[data-button]')) {
  bindButton(el, el.dataset.button);
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);
fit();

canvas.width = VIEW_W;
canvas.height = VIEW_H;

game.init(canvas, { onOpenBox: () => show('box') }).then(() => {
  game.setActive(true);
  document.getElementById('boot').hidden = true;
});

setInterval(() => {
  counter.textContent = `${save.caught.length}/100`;
}, 400);
