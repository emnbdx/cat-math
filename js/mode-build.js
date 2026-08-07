/**
 * Mode « Construire la table ».
 *
 * Le plateau part vide. L'enfant choisit une case, puis écrit son nombre au
 * doigt (un cadre par chiffre). Il déduit le nombre de la position.
 * Bonne réponse → un chat, erreur → un chat s'en va.
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
  prompt: document.getElementById('build-prompt'),
  label: document.querySelector('#build-prompt .prompt__label'),
  reward: document.getElementById('build-reward'),
  stat: document.getElementById('build-stat'),
  help: document.getElementById('build-help'),
  restart: document.getElementById('build-restart'),
};

let board = null;
let helpOn = false;
let celebrated = false;
let modelOk = false;

export async function enter() {
  if (!board) build();
  await ensureModel();
  render();
}

export function leave() {
  closePad();
  clearReward(el.reward);
}

function build() {
  board = makeBoard(el.boardwrap, { interactive: true, onPick: pick });

  el.help.addEventListener('click', () => {
    helpOn = !helpOn;
    el.help.setAttribute('aria-pressed', String(helpOn));
    paintEmptyCells();
  });

  el.restart.addEventListener('click', () => {
    if (!confirm('Recommencer ce mode ? Les chats gagnés ici seront perdus.')) return;
    resetMode('build');
    celebrated = false;
    clearReward(el.reward);
    render();
  });
}

async function ensureModel() {
  if (isModelReady()) {
    modelOk = true;
    return;
  }
  el.label.textContent = 'Chargement…';
  el.number.textContent = '⏳';
  try {
    await loadModel();
    modelOk = true;
  } catch (err) {
    modelOk = false;
    showMessage(el.reward, `Écriture indisponible : ${err.message}`);
  }
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

  if (over) {
    el.label.textContent = 'Table terminée !';
    el.number.textContent = '🎉';
  } else if (!modelOk) {
    el.label.textContent = 'Écriture indisponible';
    el.number.textContent = '–';
  } else {
    el.label.textContent = 'Choisis une case vide';
    el.number.textContent = '✍️';
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

function pick(n) {
  if (!modelOk || state.build.placed.length === TOTAL) return;

  openPad(n, ({ ok }) => {
    if (ok) {
      placeNumber(n);
      return true;
    }
    penalise();
    return false;
  });
}

function placeNumber(n) {
  const queue = state.build.queue;
  const i = queue.indexOf(n);
  if (i >= 0) queue.splice(i, 1);
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

function penalise() {
  sfx.failure();
  const id = loseCat('build');
  if (id) showReward(el.reward, getCat(id), { lost: true });
  else showMessage(el.reward, 'Pas encore de chat à perdre, essaie encore !');
  setCatCount(catCount('build'), -1);
  updateStat();
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
