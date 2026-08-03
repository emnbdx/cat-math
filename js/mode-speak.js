/**
 * Mode « Dis le nombre ».
 *
 * La table est complète. Une case s'allume, l'enfant lit le nombre à voix
 * haute, l'audio part vers Whisper (via api/transcribe.php) et on compare.
 * Un nombre déjà tiré ne revient jamais.
 *
 * Repli clavier : si le micro ou l'API n'est pas disponible, l'enfant peut
 * taper le nombre — le mode reste jouable.
 */

import { makeBoard } from './board.js';
import { state, save, resetMode, awardCat, loseCat, catCount, TOTAL } from './state.js';
import { getCat } from './cats.js';
import * as audio from './audio.js';
import { matchNumber } from './fr-numbers.js';
import * as sfx from './sfx.js';
import { setCatCount, showReward, showMessage, clearReward, burst } from './ui.js';

const MAX_RECORD_MS = 5000;

const el = {
  boardwrap: document.getElementById('speak-boardwrap'),
  number: document.getElementById('speak-number'),
  prompt: document.getElementById('speak-prompt'),
  mic: document.getElementById('mic'),
  micLabel: document.querySelector('#mic .mic__label'),
  micIcon: document.querySelector('#mic .mic__icon'),
  heard: document.getElementById('speak-heard'),
  reward: document.getElementById('speak-reward'),
  keypad: document.getElementById('speak-keypad'),
  input: document.getElementById('speak-input'),
  skip: document.getElementById('speak-skip'),
  keyboard: document.getElementById('speak-keyboard'),
  restart: document.getElementById('speak-restart'),
  stat: document.getElementById('speak-stat'),
};

let board = null;
let recorder = null;      // enregistrement en cours
let busy = false;         // transcription en cours
let keypadOn = false;
let celebrated = false;

export function enter() {
  if (!board) build();
  render();
}

export function leave() {
  cancelRecording();
  audio.releaseStream();
  clearReward(el.reward);
}

function build() {
  board = makeBoard(el.boardwrap);

  el.mic.addEventListener('click', () => {
    if (busy) return;
    if (recorder) stopRecording();
    else beginRecording();
  });

  el.skip.addEventListener('click', () => {
    const n = current();
    if (n === null) return;
    cancelRecording();
    state.speak.queue.shift();
    state.speak.missed.push(n);
    save();
    board.show(n, 'cell--missed');
    el.heard.textContent = `On reverra ${n} une autre fois.`;
    el.heard.classList.remove('is-error');
    clearReward(el.reward);
    render();
  });

  el.keyboard.addEventListener('click', () => setKeypad(!keypadOn));

  el.keypad.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number(el.input.value);
    el.input.value = '';
    if (!Number.isInteger(value) || value < 1 || value > TOTAL) return;
    evaluate(value, String(value));
  });

  el.restart.addEventListener('click', () => {
    if (!confirm('Recommencer ce mode ? Les chats gagnés ici seront perdus.')) return;
    resetMode('speak');
    celebrated = false;
    clearReward(el.reward);
    el.heard.textContent = '';
    render();
  });

  if (!audio.isSupported()) {
    el.mic.disabled = true;
    el.micLabel.textContent = 'Micro indisponible';
    setKeypad(true);
    el.heard.textContent = 'Ce navigateur n’enregistre pas le son : réponds au clavier.';
  }
}

function current() {
  return state.speak.queue[0] ?? null;
}

function setKeypad(on) {
  keypadOn = on;
  el.keypad.hidden = !on;
  el.keyboard.setAttribute('aria-pressed', String(on));
  if (on) el.input.focus();
}

function render() {
  const done = new Set(state.speak.done);
  const missed = new Set(state.speak.missed);
  const target = current();

  for (let n = 1; n <= TOTAL; n++) {
    let cls = '';
    if (n === target) cls = 'cell--target';
    else if (done.has(n)) cls = 'cell--done';
    else if (missed.has(n)) cls = 'cell--missed';
    board.show(n, cls);
  }

  el.prompt.classList.toggle('is-done', target === null);
  el.prompt.querySelector('.prompt__label').textContent =
    target === null ? 'Tous les nombres sont passés !' : 'Lis ce nombre à voix haute';
  el.number.textContent = target === null ? '🎉' : String(target);

  const over = target === null;
  el.mic.disabled = over || !audio.isSupported();
  el.skip.disabled = over;
  el.input.disabled = over;

  setCatCount(catCount('speak'));
  updateStat();

  if (over) finish();
  else scrollTargetIntoView(target);
}

function updateStat() {
  const s = state.speak;
  el.stat.textContent =
    `${s.done.length + s.missed.length}/${TOTAL} demandés · ${catCount('speak')} chats · ${s.errors} erreur${s.errors > 1 ? 's' : ''}`;
}

function scrollTargetIntoView(n) {
  const cell = board.cell(n);
  const box = cell.getBoundingClientRect();
  if (box.top < 60 || box.bottom > window.innerHeight - 20) {
    cell.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* ------------------------------------------------------- enregistrement -- */

async function beginRecording() {
  el.heard.textContent = '';
  el.heard.classList.remove('is-error');
  clearReward(el.reward);

  try {
    el.mic.style.setProperty('--rec-ms', `${MAX_RECORD_MS}ms`);
    recorder = await audio.startRecording({ maxMs: MAX_RECORD_MS });
  } catch (err) {
    recorder = null;
    micIdle();
    el.heard.textContent =
      err?.name === 'NotAllowedError'
        ? 'Le micro est bloqué : autorise-le dans le navigateur, ou réponds au clavier.'
        : 'Micro inaccessible. Réponds au clavier 🙂';
    el.heard.classList.add('is-error');
    setKeypad(true);
    return;
  }

  sfx.startRecordCue();
  el.mic.classList.add('is-recording');
  el.micIcon.textContent = '⏺';
  el.micLabel.textContent = 'J’ai fini !';

  const blob = await recorder.done;   // résolu par l'arrêt manuel ou les 5 s
  recorder = null;
  await handleAudio(blob);
}

function stopRecording() {
  recorder?.stop();
}

function cancelRecording() {
  if (!recorder) return;
  recorder.stop();
  recorder = null;
  micIdle();
}

function micIdle() {
  el.mic.classList.remove('is-recording', 'is-busy');
  el.micIcon.textContent = '🎤';
  el.micLabel.textContent = 'Appuie et parle';
}

async function handleAudio(blob) {
  const target = current();
  if (target === null) {
    micIdle();
    return;
  }

  busy = true;
  el.mic.classList.remove('is-recording');
  el.mic.classList.add('is-busy');
  el.micIcon.textContent = '⏳';
  el.micLabel.textContent = 'J’écoute…';

  try {
    const text = await audio.transcribe(blob);
    if (!text) {
      el.heard.textContent = 'Je n’ai rien entendu… réessaie en parlant plus fort.';
      el.heard.classList.add('is-error');
      return;
    }
    evaluate(null, text);
  } catch (err) {
    // Un souci technique ne coûte jamais de chat.
    el.heard.textContent = describeError(err);
    el.heard.classList.add('is-error');
    setKeypad(true);
  } finally {
    busy = false;
    micIdle();
  }
}

function describeError(err) {
  switch (err.code) {
    case 'no_api_key':
      return 'Reconnaissance vocale pas encore configurée (voir README). Réponds au clavier.';
    case 'rate_limited':
      return 'Trop de demandes d’un coup, attends quelques secondes.';
    default:
      return `Souci de connexion : ${err.message}. Tu peux répondre au clavier.`;
  }
}

/* ---------------------------------------------------------- évaluation --- */

/**
 * @param {number|null} typed  nombre saisi au clavier, sinon null
 * @param {string} text        texte entendu (ou le nombre tapé)
 */
function evaluate(typed, text) {
  const target = current();
  if (target === null) return;

  const result = typed !== null
    ? { ok: typed === target, heard: typed }
    : matchNumber(text, target);

  if (result.ok) {
    state.speak.queue.shift();
    state.speak.done.push(target);
    save();
    board.show(target, 'cell--done');

    el.heard.classList.remove('is-error');
    el.heard.innerHTML = `Oui ! <strong>${target}</strong> 🎉`;

    const id = awardCat('speak');
    if (id) {
      showReward(el.reward, getCat(id));
      burst(board.cell(target));
    } else {
      showMessage(el.reward, 'Collection complète ! 🎉');
    }
    setCatCount(catCount('speak'), 1);
    sfx.success();
    render();
    return;
  }

  // mauvaise réponse : le nombre reste affiché, on peut réessayer
  board.flash(target, 'cell--wrong');
  sfx.failure();

  el.heard.classList.add('is-error');
  el.heard.innerHTML = result.heard !== null && result.heard !== undefined
    ? `J’ai entendu <strong>${result.heard}</strong>… réessaie !`
    : `J’ai entendu « ${escapeHtml(text)} »… réessaie !`;

  const id = loseCat('speak');
  if (id) showReward(el.reward, getCat(id), { lost: true });
  else showMessage(el.reward, 'Pas encore de chat à perdre, essaie encore !');

  setCatCount(catCount('speak'), -1);
  updateStat();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function finish() {
  if (celebrated) return;
  celebrated = true;
  sfx.fanfare();
  showMessage(
    el.reward,
    `Terminé ! ${catCount('speak')} chats sur ${TOTAL}, ${state.speak.done.length} nombres réussis.`,
  );
  burst(el.prompt, ['🎉', '🐱', '⭐', '🎊']);
}
