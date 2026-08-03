/**
 * Écran de réglages : choix du moteur vocal, sons, effacement.
 *
 * Les quatre moteurs sont listés avec leur disponibilité réelle, testée sur
 * l'appareil : inutile de laisser choisir Whisper si la clé n'est pas posée, ou
 * le modèle local sur un navigateur qui ne le gère pas.
 */

import { state, save, resetAll, catCount, answered, TOTAL } from './state.js';
import { capabilities, installLocal, ENGINES } from './speech.js';
import * as sfx from './sfx.js';

const el = {
  engines: document.getElementById('engines'),
  sound: document.getElementById('settings-sound'),
  progress: document.getElementById('settings-progress'),
  reset: document.getElementById('settings-reset'),
};

const DESCRIPTIONS = {
  local: {
    icon: '🔒',
    title: 'Modèle local',
    detail: 'Gratuit. La voix ne quitte pas l’appareil. Chrome et Edge.',
  },
  browser: {
    icon: '☁️',
    title: 'Reconnaissance du navigateur',
    detail: 'Gratuit. L’audio passe par les serveurs de Google ou d’Apple.',
  },
  whisper: {
    icon: '🤖',
    title: 'Whisper (OpenAI)',
    detail: 'Payant à la minute, clé requise. Le plus fiable sur une voix d’enfant.',
  },
  keyboard: {
    icon: '⌨️',
    title: 'Clavier seulement',
    detail: 'Pas de micro : l’enfant tape le nombre.',
  },
};

/** Badge affiché à droite de chaque moteur. */
const STATES = {
  available: { text: 'disponible', cls: 'is-ok' },
  downloadable: { text: 'à installer', cls: 'is-warn' },
  downloading: { text: 'téléchargement…', cls: 'is-warn' },
  unavailable: { text: 'indisponible', cls: 'is-off' },
  unsupported: { text: 'non pris en charge ici', cls: 'is-off' },
  ready: { text: 'prêt', cls: 'is-ok' },
  no_key: { text: 'clé non configurée', cls: 'is-off' },
  absent: { text: 'serveur PHP absent', cls: 'is-off' },
  error: { text: 'erreur serveur', cls: 'is-off' },
};

let caps = null;
let onChange = null;

/** @param {() => void} notify  appelé quand le moteur choisi change */
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

  // Squelette immédiat, puis on remplit dès que la détection répond.
  if (!caps) el.engines.innerHTML = '<p class="settings__intro">Détection des moteurs…</p>';
  caps = await capabilities();
  paint();
}

function paint() {
  const frag = document.createDocumentFragment();

  for (const engine of ENGINES) {
    const info = DESCRIPTIONS[engine];
    const cap = caps[engine];
    const badge = STATES[cap.state] ?? STATES.unavailable;

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

    const state_ = document.createElement('span');
    state_.className = `engine__state ${badge.cls}`;
    state_.textContent = badge.text;

    body.append(title, detail, state_);
    row.append(radio, body);

    // Chrome peut télécharger le modèle français à la demande.
    if (engine === 'local' && (cap.state === 'downloadable' || cap.state === 'downloading')) {
      const install = document.createElement('button');
      install.type = 'button';
      install.className = 'btn btn--small';
      install.textContent = '⬇️ Installer le modèle français';
      install.disabled = cap.state === 'downloading';
      install.addEventListener('click', async (event) => {
        event.preventDefault();
        install.disabled = true;
        install.textContent = '⏳ Téléchargement…';
        try {
          await installLocal();
          caps = await capabilities();
          paint();
        } catch (err) {
          install.textContent = `⚠️ ${err.message}`;
        }
      });
      body.append(install);
    }

    frag.append(row);
  }

  const note = document.createElement('p');
  note.className = 'settings__intro';
  note.textContent =
    'Le modèle local est plus léger que Whisper, donc un peu moins bon sur les ' +
    'voix très jeunes. Le jeu compare plusieurs hypothèses de reconnaissance ' +
    'pour compenser.';
  frag.append(note);

  el.engines.replaceChildren(frag);
}

/** Capacités déjà détectées (partagées avec le mode voix). */
export function knownCapabilities() {
  return caps;
}
