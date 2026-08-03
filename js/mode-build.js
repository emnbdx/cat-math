/**
 * Mode « Construire la table », avec deux façons de répondre.
 *
 * 👆 Toucher (par défaut)
 *   Le plateau part vide. On tire un nombre au hasard parmi ceux qui restent et
 *   l'enfant doit toucher sa case. Coup de pouce après deux essais ratés.
 *
 * ✍️ Écrire
 *   L'enfant choisit lui-même une case vide, puis écrit son nombre au doigt
 *   (un cadre par chiffre). C'est l'inverse : il déduit le nombre de la
 *   position, au lieu de déduire la position du nombre.
 *
 * Dans les deux cas : bonne réponse → un chat, erreur → un chat s'en va.
 */

import { makeBoard } from './board.js';
import { state, save, resetMode, awardCat, loseCat, catCount, TOTAL } from './state.js';
import { getCat } from './cats.js';
import { loadModel, isModelReady } from './digits.js';
import { openPad, closePad } from './writepad.js';
import * as sfx from './sfx.js';
import { setCatCount, showReward, showMessage, clearReward, burst } from './ui.js';

const el = {
  boardwrap: document.getElementById('build-boardwrap'),
  number: document.getElementById('build-number'),
  hint: document.getElementById('build-hint'),
  prompt: document.getElementById('build-prompt'),
  label: document.querySelector('#build-prompt .prompt__label'),
  reward: document.getElementById('build-reward'),
  stat: document.getElementById('build-stat'),
  write: document.getElementById('build-write'),
  help: document.getElementById('build-help'),
  restart: document.getElementById('build-restart'),
};

let board = null;
let helpOn = false;
let writeOn = false;
let wrongTries = 0;
let celebrated = false;

export function enter() {
  if (!board) build();
  render();
}

export function leave() {
  closePad();
  clearReward(el.reward);
}

function build() {
  board = makeBoard(el.boardwrap, { interactive: true, onPick: pick });

  el.write.addEventListener('click', toggleWrite);

  el.help.addEventListener('click', () => {
    helpOn = !helpOn;
    el.help.setAttribute('aria-pressed', String(helpOn));
    paintEmptyCells();
  });

  el.restart.addEventListener('click', () => {
    if (!confirm('Recommencer ce mode ? Les chats gagnés ici seront perdus.')) return;
    resetMode('build');
    wrongTries = 0;
    celebrated = false;
    clearReward(el.reward);
    render();
  });
}

/* ------------------------------------------------- bascule de la réponse -- */

async function toggleWrite() {
  if (writeOn) {
    writeOn = false;
    el.write.setAttribute('aria-pressed', 'false');
    render();
    return;
  }

  // Le modèle de reconnaissance (~90 Ko) n'est chargé qu'à la demande.
  if (!isModelReady()) {
    el.write.disabled = true;
    const before = el.write.textContent;
    el.write.textContent = '⏳ Chargement…';
    try {
      await loadModel();
    } catch (err) {
      el.write.textContent = before;
      el.write.disabled = false;
      showMessage(el.reward, `Écriture indisponible : ${err.message}`);
      return;
    }
    el.write.textContent = before;
    el.write.disabled = false;
  }

  writeOn = true;
  el.write.setAttribute('aria-pressed', 'true');
  clearReward(el.reward);
  render();
}

/* ----------------------------------------------------------------- rendu -- */

/** Nombre à poser en mode « toucher », ou null si la table est terminée. */
function current() {
  return state.build.queue[0] ?? null;
}

function render() {
  const { placed } = state.build;
  const done = new Set(placed);

  for (let n = 1; n <= TOTAL; n++) {
    if (done.has(n)) board.fill(n);
    else board.empty(n, helpOn);
  }

  const over = placed.length === TOTAL;
  el.prompt.classList.toggle('is-done', over);
  el.hint.textContent = '';

  if (over) {
    el.label.textContent = 'Table terminée !';
    el.number.textContent = '🎉';
  } else if (writeOn) {
    el.label.textContent = 'Choisis une case vide';
    el.number.textContent = '✍️';
  } else {
    el.label.textContent = 'Pose ce nombre';
    el.number.textContent = String(current());
  }

  setCatCount(catCount('build'));
  updateStat();

  if (over) finish();
}

function updateStat() {
  const s = state.build;
  el.stat.textContent =
    `${s.placed.length}/${TOTAL} posés · ${catCount('build')} chats · ${s.errors} erreur${s.errors > 1 ? 's' : ''}`;
}

function paintEmptyCells() {
  const done = new Set(state.build.placed);
  for (let n = 1; n <= TOTAL; n++) {
    if (!done.has(n)) board.empty(n, helpOn);
  }
}

/* ------------------------------------------------------------- réponses -- */

function pick(n) {
  if (state.build.placed.length === TOTAL) return;

  if (writeOn) {
    // La case choisie devient la question : quel nombre va ici ?
    openPad(n, ({ ok }) => {
      if (ok) {
        placeNumber(n);
        return true;      // ferme l'ardoise
      }
      penalise();
      return false;       // on laisse l'enfant réessayer
    });
    return;
  }

  const target = current();
  if (n === target) {
    placeNumber(n);
    wrongTries = 0;
    if (state.build.placed.length < TOTAL) {
      el.number.textContent = String(current());
      el.hint.textContent = '';
    } else {
      render();
    }
    return;
  }

  // mauvaise case
  wrongTries++;
  board.flash(n, 'cell--wrong');
  penalise();

  el.hint.textContent =
    wrongTries === 1
      ? `Regarde la ligne des ${tens(target)}`
      : 'Un indice clignote sur le plateau';
  if (wrongTries >= 2) board.flash(target, 'cell--hint', 3000);
}

/** Pose définitivement `n` sur le plateau et récompense. */
function placeNumber(n) {
  const queue = state.build.queue;
  const i = queue.indexOf(n);
  if (i >= 0) queue.splice(i, 1);       // ce nombre ne sera plus redemandé
  state.build.placed.push(n);
  save();
  board.fill(n);

  const id = awardCat('build');
  if (id) {
    showReward(el.reward, getCat(id));
    burst(board.cell(n));
  } else {
    showMessage(el.reward, 'Collection complète ! 🎉');
  }
  setCatCount(catCount('build'), 1);
  sfx.success();
  updateStat();

  if (state.build.placed.length === TOTAL) finish();
}

/** Une erreur : un chat s'en va. */
function penalise() {
  sfx.failure();
  const id = loseCat('build');
  if (id) showReward(el.reward, getCat(id), { lost: true });
  else showMessage(el.reward, 'Pas encore de chat à perdre, essaie encore !');
  setCatCount(catCount('build'), -1);
  updateStat();
}

/** « la ligne des soixante-dix » : repère parlé pour l'indice. */
function tens(n) {
  const decade = Math.floor((n - 1) / 10) * 10;
  const names = {
    0: 'nombres jusqu’à 10',
    10: 'dix',
    20: 'vingt',
    30: 'trente',
    40: 'quarante',
    50: 'cinquante',
    60: 'soixante',
    70: 'soixante-dix',
    80: 'quatre-vingts',
    90: 'quatre-vingt-dix',
  };
  return names[decade];
}

function finish() {
  if (celebrated) return;
  celebrated = true;
  sfx.fanfare();
  showMessage(
    el.reward,
    `Bravo ! Table complète avec ${catCount('build')} chats sur ${TOTAL}.`,
  );
  burst(el.prompt, ['🎉', '🐱', '⭐', '🎊']);
}
