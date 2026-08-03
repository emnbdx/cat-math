/**
 * Mode « Construire la table ».
 *
 * Le plateau part vide. On tire un nombre au hasard parmi ceux qui restent et
 * l'enfant doit toucher sa case. Bonne place → un chat ; erreur → un chat s'en
 * va (et un coup de pouce apparaît après deux essais ratés sur le même nombre).
 */

import { makeBoard } from './board.js';
import { state, save, resetMode, awardCat, loseCat, catCount, TOTAL } from './state.js';
import { getCat } from './cats.js';
import * as sfx from './sfx.js';
import { setCatCount, showReward, showMessage, clearReward, burst } from './ui.js';

const el = {
  boardwrap: document.getElementById('build-boardwrap'),
  number: document.getElementById('build-number'),
  hint: document.getElementById('build-hint'),
  prompt: document.getElementById('build-prompt'),
  reward: document.getElementById('build-reward'),
  stat: document.getElementById('build-stat'),
  help: document.getElementById('build-help'),
  restart: document.getElementById('build-restart'),
};

let board = null;
let helpOn = false;
let wrongTries = 0;
let celebrated = false;

export function enter() {
  if (!board) build();
  render();
}

export function leave() {
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
    wrongTries = 0;
    celebrated = false;
    clearReward(el.reward);
    render();
  });
}

/** Nombre à poser (tête de file), ou null si la table est terminée. */
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

  const n = current();
  el.prompt.classList.toggle('is-done', n === null);
  el.number.textContent = n === null ? '🎉' : String(n);
  el.prompt.querySelector('.prompt__label').textContent =
    n === null ? 'Table terminée !' : 'Pose ce nombre';
  el.hint.textContent = '';

  setCatCount(catCount('build'));
  el.stat.textContent =
    `${placed.length}/${TOTAL} posés · ${catCount('build')} chats · ${state.build.errors} erreur${state.build.errors > 1 ? 's' : ''}`;

  if (n === null && placed.length === TOTAL) finish();
}

function paintEmptyCells() {
  const done = new Set(state.build.placed);
  for (let n = 1; n <= TOTAL; n++) {
    if (!done.has(n)) board.empty(n, helpOn);
  }
}

function pick(n) {
  const target = current();
  if (target === null) return;

  if (n === target) {
    state.build.queue.shift();
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
    wrongTries = 0;
    nextPrompt();
    return;
  }

  // mauvaise case
  wrongTries++;
  board.flash(n, 'cell--wrong');
  sfx.failure();

  const id = loseCat('build');
  if (id) {
    showReward(el.reward, getCat(id), { lost: true });
  } else {
    showMessage(el.reward, 'Pas encore de chat à perdre, essaie encore !');
  }
  setCatCount(catCount('build'), -1);

  el.hint.textContent =
    wrongTries === 1
      ? `Regarde la ligne des ${tens(target)}`
      : 'Un indice clignote sur le plateau';
  if (wrongTries >= 2) board.flash(target, 'cell--hint', 3000);

  el.stat.textContent =
    `${state.build.placed.length}/${TOTAL} posés · ${catCount('build')} chats · ${state.build.errors} erreur${state.build.errors > 1 ? 's' : ''}`;
}

function nextPrompt() {
  const n = current();
  if (n === null) {
    render();
    return;
  }
  el.number.textContent = String(n);
  el.hint.textContent = '';
  el.stat.textContent =
    `${state.build.placed.length}/${TOTAL} posés · ${catCount('build')} chats · ${state.build.errors} erreur${state.build.errors > 1 ? 's' : ''}`;
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
