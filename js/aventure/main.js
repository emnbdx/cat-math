/**
 * Point d'entrée de l'aventure : mise à l'échelle des deux écrans, panneaux
 * de l'écran tactile (Jouer / Collection / Réglages) et boutons.
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
import * as minimap from './minimap.js';
import { getCat } from '../cats.js';
import { catSprite } from './sprites.js';

const canvas = document.getElementById('view');
const panels = new Map(
  [...document.querySelectorAll('[data-view]')].map((el) => [el.dataset.view, el]),
);
const tabs = [...document.querySelectorAll('[data-tab]')];
const counters = [document.getElementById('hud-count'), document.getElementById('pad-count')];

let current = 'game';

/* ------------------------------------------------------ mise à l'échelle */

/**
 * Les deux écrans gardent la même taille, et un facteur d'agrandissement
 * entier dès que la place le permet : c'est ce qui donne des pixels bien
 * carrés. En dessous de ×2 (petits téléphones) on autorise les quarts.
 */
function fit() {
  const stacked = window.innerHeight >= window.innerWidth;
  const availW = window.innerWidth - 56;
  const availH = window.innerHeight - 110;

  const raw = stacked
    ? Math.min(availW / VIEW_W, (availH - 14) / (VIEW_H * 2))
    : Math.min((availW - 14) / (VIEW_W * 2), availH / VIEW_H);

  const scale = raw >= 2 ? Math.floor(raw) : Math.max(0.85, Math.round(raw * 20) / 20);
  document.documentElement.style.setProperty('--scale', scale);
}

/* -------------------------------------------------------------- écrans -- */

function show(name) {
  if (name === current) return;
  if (current === 'box') dex.close();
  current = name;

  for (const [key, el] of panels) el.hidden = key !== name;
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));

  // le monde continue de tourner en haut ; seules les commandes changent d'écran
  game.setPlaying(name === 'game');
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
window.addEventListener('load', fit);
window.visualViewport?.addEventListener('resize', fit);
// certains navigateurs mobiles appliquent le viewport après le premier rendu :
// on suit la taille réelle de la page plutôt que d'y croire sur parole
new ResizeObserver(fit).observe(document.documentElement);
fit();

canvas.width = VIEW_W;
canvas.height = VIEW_H;

game.init(canvas, { onOpenBox: () => show('box') }).then(() => {
  game.setPlaying(true);
  document.getElementById('boot').hidden = true;
});

/* ------------------------------------------------- écran du bas, vivant -- */

const latestEl = document.getElementById('latest');
const spriteUrls = new Map();

function spriteUrl(cat) {
  if (!spriteUrls.has(cat.id)) spriteUrls.set(cat.id, catSprite(cat, 0).toDataURL());
  return spriteUrls.get(cat.id);
}

/** Les cinq dernières prises, du plus récent au plus ancien. */
function renderLatest() {
  const ids = save.caught.slice(-5).reverse();
  if (latestEl.childElementCount === ids.length && latestEl.dataset.head === String(ids[0] ?? '')) {
    return;
  }
  latestEl.dataset.head = String(ids[0] ?? '');
  latestEl.replaceChildren(
    ...ids.map((id) => {
      const cat = getCat(id);
      const li = document.createElement('li');
      li.className = 'latest__item';
      if (cat) {
        const img = document.createElement('img');
        img.src = spriteUrl(cat);
        img.alt = '';
        li.append(img, Object.assign(document.createElement('span'), { textContent: cat.name }));
      }
      return li;
    }),
  );
  if (!ids.length) {
    latestEl.innerHTML = '<li class="latest__empty">Aucun chat pour l’instant…</li>';
  }
}

minimap.attach(document.getElementById('minimap'));

setInterval(() => {
  const value = save.caught.length;
  counters[0].textContent = `${value}/100`;
  counters[1].textContent = String(value);
  if (current === 'game') {
    minimap.draw(game.playerTile());
    renderLatest();
  }
}, 500);
