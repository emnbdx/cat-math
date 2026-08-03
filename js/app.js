/**
 * Point d'entrée : navigation entre les écrans, collection, préférences.
 */

import { loadCats, getCat, catArt } from './cats.js';
import { state, save, catCount, answered, TOTAL } from './state.js';
import { setCatCount, hideCatCount, openCatSheet } from './ui.js';
import * as sfx from './sfx.js';
import * as build from './mode-build.js';
import * as speak from './mode-speak.js';
import * as settings from './settings.js';

const screens = new Map(
  [...document.querySelectorAll('[data-screen]')].map((s) => [s.dataset.screen, s]),
);

const backBtn = document.querySelector('.topbar__back');
const titleEl = document.querySelector('.topbar__title');
const soundBtn = document.getElementById('sound-toggle');

const TITLES = {
  home: '🐱 Les 100 chats',
  build: '🧩 Construire la table',
  speak: '🎤 Dis le nombre',
  collection: '📚 Ma collection',
  settings: '⚙️ Réglages',
};

const modes = { build, speak };
let currentScreen = null;
let collectionTab = 'build';

/* ---------------------------------------------------------- navigation --- */

async function show(name) {
  if (!screens.has(name)) name = 'home';
  if (name === currentScreen) return;

  if (currentScreen && modes[currentScreen]) modes[currentScreen].leave();

  for (const [key, section] of screens) section.hidden = key !== name;
  currentScreen = name;

  titleEl.textContent = TITLES[name];
  document.title = `${TITLES[name].replace(/^\S+\s/, '')} — Les 100 chats`;
  backBtn.hidden = name === 'home';
  window.scrollTo({ top: 0 });

  if (modes[name]) {
    await modes[name].enter();
  } else if (name === 'collection') {
    renderCollection();
  } else if (name === 'settings') {
    hideCatCount();
    await settings.render();
  } else {
    hideCatCount();
    renderHomeProgress();
  }
}

function navigate(name) {
  const hash = name === 'home' ? '' : `#${name}`;
  if (location.hash !== hash) location.hash = hash;
  else show(name);
}

window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'home'));

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-nav]');
  if (!trigger) return;
  sfx.pop();
  navigate(trigger.dataset.nav);
});

/* -------------------------------------------------------------- accueil -- */

function renderHomeProgress() {
  const labels = {
    build: `${answered('build')}/${TOTAL} posés · ${catCount('build')} 🐱`,
    speak: `${answered('speak')}/${TOTAL} demandés · ${catCount('speak')} 🐱`,
    collection: `${catCount('build') + catCount('speak')} chats sur ${TOTAL * 2}`,
  };
  for (const [key, text] of Object.entries(labels)) {
    const node = document.querySelector(`[data-progress="${key}"]`);
    if (node) node.textContent = text;
  }
}

/* ----------------------------------------------------------- collection -- */

const gallery = document.getElementById('gallery');
const fill = document.getElementById('collection-fill');
const countLabel = document.getElementById('collection-count');

document.querySelectorAll('.tabs__tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    collectionTab = tab.dataset.tab;
    document.querySelectorAll('.tabs__tab').forEach((t) => {
      t.classList.toggle('is-active', t === tab);
    });
    renderCollection();
  });
});

function renderCollection() {
  const owned = new Set(state[collectionTab].cats);
  setCatCount(owned.size);

  fill.style.width = `${(owned.size / TOTAL) * 100}%`;
  countLabel.textContent = owned.size === TOTAL
    ? `Collection complète : les ${TOTAL} chats sont là ! 🎉`
    : `${owned.size} chats sur ${TOTAL}`;

  const frag = document.createDocumentFragment();
  for (let id = 1; id <= TOTAL; id++) {
    const cat = getCat(id);
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'slot';
    slot.dataset.id = String(id);

    if (owned.has(id)) {
      slot.append(catArt(cat));
      const name = document.createElement('span');
      name.className = 'slot__name';
      name.textContent = cat.name;
      slot.append(name);
      slot.setAttribute('aria-label', `${cat.name}, chat ${id} sur ${TOTAL}`);
      slot.addEventListener('click', () => openCatSheet(cat));
    } else {
      slot.classList.add('slot--locked');
      slot.disabled = true;
      slot.setAttribute('aria-label', `Chat ${id} pas encore gagné`);
    }
    frag.append(slot);
  }
  gallery.replaceChildren(frag);
}

/* ------------------------------------------------------------ réglages -- */

function paintSoundButton() {
  soundBtn.setAttribute('aria-pressed', String(state.sound));
  soundBtn.textContent = state.sound ? '🔊' : '🔇';
}

soundBtn.addEventListener('click', () => {
  state.sound = !state.sound;
  save();
  paintSoundButton();
  if (state.sound) sfx.pop();
});

// Les réglages touchent au son et au moteur vocal : on resynchronise l'affichage.
settings.init(paintSoundButton);

/* --------------------------------------------------------- démarrage --- */

paintSoundButton();

try {
  await loadCats();
  await show(location.hash.slice(1) || 'home');
} catch (err) {
  document.getElementById('main').innerHTML =
    `<p style="text-align:center">Impossible de charger le catalogue des chats.<br>
     <small>${String(err.message)}</small></p>`;
}
