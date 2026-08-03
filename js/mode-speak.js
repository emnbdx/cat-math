/**
 * Mode « Dis le nombre ».
 *
 * La table est complète. Une case s'allume, l'enfant lit le nombre à voix
 * haute, et la transcription est comparée au nombre attendu. Un nombre déjà
 * tiré ne revient jamais.
 *
 * Le moteur vocal vient des réglages — navigateur (défaut) ou Whisper ;
 * js/speech.js masque leurs différences. Si celui qui est choisi tombe en
 * panne, on prend l'autre ; s'il n'en reste aucun, l'enfant répond au clavier.
 * Un souci technique ne coûte jamais de chat.
 */

import { makeBoard } from './board.js';
import { state, save, resetMode, awardCat, loseCat, catCount, TOTAL } from './state.js';
import { getCat } from './cats.js';
import { releaseStream } from './audio.js';
import { matchNumber } from './fr-numbers.js';
import { capabilities, resolveEngine, listen, ENGINE_LABELS } from './speech.js';
import * as sfx from './sfx.js';
import { setCatCount, showReward, showMessage, clearReward, burst } from './ui.js';

const el = {
  boardwrap: document.getElementById('speak-boardwrap'),
  number: document.getElementById('speak-number'),
  prompt: document.getElementById('speak-prompt'),
  label: document.querySelector('#speak-prompt .prompt__label'),
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
  engine: document.getElementById('speak-engine'),
  stat: document.getElementById('speak-stat'),
};

let board = null;
let session = null;        // écoute en cours
let busy = false;
let keypadOn = false;
let celebrated = false;

let caps = null;
let engine = null;         // null = aucun moteur vocal, on répond au clavier
const broken = new Set();  // moteurs tombés en panne pendant la session

export async function enter() {
  if (!board) build();
  await pickEngine();
  render();
}

export function leave() {
  cancelListening();
  releaseStream();
  clearReward(el.reward);
}

function build() {
  board = makeBoard(el.boardwrap);

  el.mic.addEventListener('click', () => {
    if (busy) return;
    if (session) stopListening();
    else beginListening();
  });

  el.skip.addEventListener('click', () => {
    const n = current();
    if (n === null) return;
    cancelListening();
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
    evaluate({ typed: value });
  });

  el.restart.addEventListener('click', () => {
    if (!confirm('Recommencer ce mode ? Les chats gagnés ici seront perdus.')) return;
    resetMode('speak');
    celebrated = false;
    clearReward(el.reward);
    el.heard.textContent = '';
    render();
  });
}

/* --------------------------------------------------------- moteur vocal -- */

/** Redétecte les capacités et choisit le moteur effectif. */
async function pickEngine() {
  caps = await capabilities();
  applyEngine(resolveEngine(state.engine, caps, broken));
}

function applyEngine(next) {
  engine = next;
  const chosen = state.engine;

  if (engine === null) {
    el.engine.textContent = 'Aucun moteur vocal disponible ici — réponds au clavier.';
    el.engine.classList.add('is-fallback');
    el.mic.disabled = true;
    el.micLabel.textContent = 'Micro indisponible';
    setKeypad(true);
    return;
  }

  const fellBack = engine !== chosen;
  el.engine.textContent = fellBack
    ? `Moteur : ${ENGINE_LABELS[engine]} (${ENGINE_LABELS[chosen]} indisponible)`
    : `Moteur : ${ENGINE_LABELS[engine]}`;
  el.engine.classList.toggle('is-fallback', fellBack);
  el.mic.disabled = current() === null;
  el.micLabel.textContent = 'Appuie et parle';
}

/** Le moteur courant est mort : on prend l'autre, ou on passe au clavier. */
function demoteEngine(reason) {
  broken.add(engine);
  const next = resolveEngine(state.engine, caps, broken);
  applyEngine(next);
  el.heard.textContent = next
    ? `${reason} On passe à : ${ENGINE_LABELS[next]}.`
    : `${reason} Réponds au clavier.`;
  el.heard.classList.add('is-error');
}

/* ---------------------------------------------------------------- rendu -- */

function current() {
  return state.speak.queue[0] ?? null;
}

function setKeypad(on) {
  keypadOn = on;
  el.keypad.hidden = !on;
  el.keyboard.setAttribute('aria-pressed', String(on));
  if (on && current() !== null) el.input.focus();
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

  const over = target === null;
  el.prompt.classList.toggle('is-done', over);
  el.label.textContent = over ? 'Tous les nombres sont passés !' : 'Lis ce nombre à voix haute';
  el.number.textContent = over ? '🎉' : String(target);

  el.mic.disabled = over || engine === null;
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

/* -------------------------------------------------------------- écoute -- */

async function beginListening() {
  el.heard.textContent = '';
  el.heard.classList.remove('is-error');
  clearReward(el.reward);

  try {
    session = await listen({
      engine,
      onPartial: (text) => {
        // Web Speech livre la transcription au fil de la phrase.
        el.heard.textContent = `… ${text}`;
        el.heard.classList.remove('is-error');
      },
      onPhase: (phase) => {
        if (phase === 'listening') micListening();
        if (phase === 'transcribing') micBusy();
      },
    });
  } catch (err) {
    session = null;
    micIdle();
    handleEngineError(err);
    return;
  }

  sfx.startRecordCue();

  let result;
  try {
    result = await session.done;
  } catch (err) {
    session = null;
    micIdle();
    handleEngineError(err);
    return;
  }

  session = null;
  micIdle();

  if (!result.text) {
    el.heard.textContent = 'Je n’ai rien entendu… réessaie en parlant plus fort.';
    el.heard.classList.add('is-error');
    return;
  }
  evaluate({ heardText: result.text, alternatives: result.alternatives });
}

/** Un pépin technique : jamais de chat perdu, et on propose une porte de sortie. */
function handleEngineError(err) {
  busy = false;
  if (err.engineFailure || err.code === 'no_api_key') {
    demoteEngine(describeError(err));
    return;
  }
  el.heard.textContent = describeError(err);
  el.heard.classList.add('is-error');
  if (err.code === 'not-allowed' || err.name === 'NotAllowedError') setKeypad(true);
}

function describeError(err) {
  switch (err.code) {
    case 'no_api_key':
      return 'Whisper n’est pas configuré (voir README).';
    case 'rate_limited':
      return 'Trop de demandes d’un coup, attends quelques secondes.';
    case 'not-allowed':
      return 'Le micro est bloqué : autorise-le, ou réponds au clavier.';
    default:
      return err.message ?? 'Reconnaissance impossible.';
  }
}

function stopListening() {
  session?.stop();
}

function cancelListening() {
  if (!session) return;
  session.stop();
  session = null;
  micIdle();
}

function micListening() {
  busy = false;
  el.mic.style.setProperty('--rec-ms', '9000ms');
  el.mic.classList.add('is-recording');
  el.mic.classList.remove('is-busy');
  el.micIcon.textContent = '⏺';
  el.micLabel.textContent = 'J’ai fini !';
}

function micBusy() {
  busy = true;
  el.mic.classList.remove('is-recording');
  el.mic.classList.add('is-busy');
  el.micIcon.textContent = '⏳';
  el.micLabel.textContent = 'J’écoute…';
}

function micIdle() {
  busy = false;
  el.mic.classList.remove('is-recording', 'is-busy');
  el.micIcon.textContent = '🎤';
  el.micLabel.textContent = engine === null ? 'Micro indisponible' : 'Appuie et parle';
}

/* ---------------------------------------------------------- évaluation --- */

/**
 * @param {object} answer
 * @param {number} [answer.typed]          nombre saisi au clavier
 * @param {string} [answer.heardText]      meilleure transcription
 * @param {string[]} [answer.alternatives] autres hypothèses du moteur
 */
function evaluate({ typed, heardText, alternatives = [] }) {
  const target = current();
  if (target === null) return;

  let ok;
  let heard;
  if (typed !== undefined) {
    ok = typed === target;
    heard = typed;
  } else {
    // On accepte si le bon nombre apparaît dans n'importe quelle hypothèse :
    // les moteurs en proposent plusieurs, autant s'en servir.
    const tries = alternatives.length ? alternatives : [heardText];
    const results = tries.map((text) => matchNumber(text, target));
    ok = results.some((r) => r.ok);
    heard = results.find((r) => r.ok)?.heard ?? results[0]?.heard ?? null;
  }

  if (ok) {
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
  el.heard.innerHTML = heard !== null && heard !== undefined
    ? `J’ai entendu <strong>${heard}</strong>… réessaie !`
    : `J’ai entendu « ${escapeHtml(heardText ?? '')} »… réessaie !`;

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
