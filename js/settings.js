/**
 * Écran de réglages : moteur vocal, sons, effacement.
 *
 * Les deux moteurs sont listés avec leur disponibilité réelle, testée sur
 * l'appareil : inutile de laisser choisir Whisper si la clé n'est pas posée.
 */

import { state, save, resetAll, catCount, answered, TOTAL } from './state.js';
import { capabilities, ENGINES } from './speech.js';
import * as sfx from './sfx.js';

const el = {
  engines: document.getElementById('engines'),
  sound: document.getElementById('settings-sound'),
  progress: document.getElementById('settings-progress'),
  reset: document.getElementById('settings-reset'),
};

const DESCRIPTIONS = {
  browser: {
    icon: '☁️',
    title: 'Reconnaissance du navigateur',
    detail: 'Gratuite, sans clé. Chrome, Edge et Safari.',
  },
  whisper: {
    icon: '🤖',
    title: 'Whisper (OpenAI)',
    detail: 'Payant à la minute, clé requise. Le plus fiable sur une voix d’enfant, et marche sur Firefox.',
  },
};

/** Badge affiché sous chaque moteur. */
const STATES = {
  available: { text: 'disponible', cls: 'is-ok' },
  ready: { text: 'prêt', cls: 'is-ok' },
  unsupported: { text: 'non pris en charge ici', cls: 'is-off' },
  no_key: { text: 'clé non configurée', cls: 'is-off' },
  absent: { text: 'serveur PHP absent', cls: 'is-off' },
  error: { text: 'erreur serveur', cls: 'is-off' },
};

let caps = null;
let onChange = null;

/** @param {() => void} notify  appelé quand un réglage change */
export function init(notify) {
  onChange = notify;

  el.sound.addEventListener('change', () => {
    state.sound = el.sound.checked;
    save();
    onChange?.();
    if (state.sound) sfx.pop();
  });

  el.reset.addEventListener('click', () => {
    if (!confirm('Tout effacer : les deux tables et les deux collections de chats ?')) return;
    resetAll();
    location.reload();
  });
}

export async function render() {
  el.sound.checked = state.sound;
  el.progress.textContent =
    `Table : ${answered('build')}/${TOTAL} posés, ${catCount('build')} chats. ` +
    `Voix : ${answered('speak')}/${TOTAL} demandés, ${catCount('speak')} chats.`;

  if (!caps) el.engines.innerHTML = '<p class="settings__intro">Détection des moteurs…</p>';
  caps = await capabilities();
  paint();
}

function paint() {
  const frag = document.createDocumentFragment();

  for (const engine of ENGINES) {
    const info = DESCRIPTIONS[engine];
    const cap = caps[engine];
    const badge = STATES[cap.state] ?? STATES.error;

    const row = document.createElement('label');
    row.className = `engine${cap.usable ? '' : ' engine--off'}`;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'engine';
    radio.value = engine;
    radio.checked = state.engine === engine;
    radio.addEventListener('change', () => {
      state.engine = engine;
      save();
      onChange?.();
      sfx.pop();
    });

    const body = document.createElement('span');
    body.className = 'engine__body';

    const title = document.createElement('span');
    title.className = 'engine__title';
    title.textContent = `${info.icon} ${info.title}`;

    const detail = document.createElement('span');
    detail.className = 'engine__detail';
    detail.textContent = info.detail;

    const badgeEl = document.createElement('span');
    badgeEl.className = `engine__state ${badge.cls}`;
    badgeEl.textContent = badge.text;

    body.append(title, detail, badgeEl);
    row.append(radio, body);
    frag.append(row);
  }

  const note = document.createElement('p');
  note.className = 'settings__intro';
  note.textContent =
    'Si le moteur choisi n’est pas disponible, le jeu prend l’autre ; si aucun ' +
    'des deux ne répond, l’enfant peut toujours taper le nombre au clavier.';
  frag.append(note);

  el.engines.replaceChildren(frag);
}
