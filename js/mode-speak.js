/**
 * Mode « Dis le nombre ».
 *
 * La table est complète. Une case s'allume, l'enfant lit le nombre à voix
 * haute, et Whisper transcrit. Un nombre déjà tiré ne revient jamais.
 * Sans micro / Whisper, le mode ne fonctionne pas.
 * Un souci technique ne coûte jamais de chat.
 */

import { makeBoard } from './board.js';
import { state, save, resetMode, awardCat, loseCat, catCount, TOTAL } from './state.js';
import { getCat } from './cats.js';
import { releaseStream } from './audio.js';
import { matchNumber } from './fr-numbers.js';
import { whisperStatus, listen } from './speech.js';
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
  skip: document.getElementById('speak-skip'),
  restart: document.getElementById('speak-restart'),
  engine: document.getElementById('speak-engine'),
  stat: document.getElementById('speak-stat'),
};

let board = null;
let session = null;
let busy = false;
let celebrated = false;
let voiceReady = false;

export async function enter() {
  if (!board) build();
  await checkVoice();
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
    if (busy || !voiceReady) return;
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

  el.restart.addEventListener('click', () => {
    if (!confirm('Recommencer ce mode ? Les chats gagnés ici seront perdus.')) return;
    resetMode('speak');
    celebrated = false;
    clearReward(el.reward);
    el.heard.textContent = '';
    render();
  });
}

async function checkVoice() {
  const status = await whisperStatus();
  voiceReady = status === 'ready';

  if (voiceReady) {
    el.engine.textContent = '';
    el.engine.classList.remove('is-fallback');
    el.mic.disabled = current() === null;
    el.micLabel.textContent = 'Appuie et parle';
    return;
  }

  el.engine.textContent = statusMessage(status);
  el.engine.classList.add('is-fallback');
  el.mic.disabled = true;
  el.micLabel.textContent = 'Micro indisponible';
}

function statusMessage(status) {
  switch (status) {
    case 'no_key':
      return 'Whisper n’est pas configuré (voir README).';
    case 'unsupported':
      return 'Ce navigateur ne permet pas d’enregistrer le micro.';
    case 'absent':
      return 'Serveur Whisper absent — le mode voix ne peut pas démarrer.';
    default:
      return 'Whisper indisponible — le mode voix ne peut pas démarrer.';
  }
}

function current() {
  return state.speak.queue[0] ?? null;
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

  el.mic.disabled = over || !voiceReady;
  el.skip.disabled = over || !voiceReady;

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

async function beginListening() {
  el.heard.textContent = '';
  el.heard.classList.remove('is-error');
  clearReward(el.reward);

  try {
    session = await listen({
      onPhase: (phase) => {
        if (phase === 'listening') micListening();
        if (phase === 'transcribing') micBusy();
      },
    });
  } catch (err) {
    session = null;
    micIdle();
    handleVoiceError(err);
    return;
  }

  sfx.startRecordCue();

  let result;
  try {
    result = await session.done;
  } catch (err) {
    session = null;
    micIdle();
    handleVoiceError(err);
    return;
  }

  session = null;
  micIdle();

  if (!result.text) {
    el.heard.textContent = 'Je n’ai rien entendu… réessaie en parlant plus fort.';
    el.heard.classList.add('is-error');
    return;
  }
  evaluate(result.text, result.alternatives);
}

function handleVoiceError(err) {
  busy = false;
  el.heard.textContent = describeError(err);
  el.heard.classList.add('is-error');
  if (err.code === 'no_api_key' || err.code === 'not-allowed' || err.name === 'NotAllowedError') {
    voiceReady = false;
    el.mic.disabled = true;
    el.micLabel.textContent = 'Micro indisponible';
    el.skip.disabled = true;
  }
}

function describeError(err) {
  switch (err.code) {
    case 'no_api_key':
      return 'Whisper n’est pas configuré (voir README).';
    case 'rate_limited':
      return 'Trop de demandes d’un coup, attends quelques secondes.';
    case 'not-allowed':
      return 'Le micro est bloqué : autorise-le dans le navigateur.';
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
  el.mic.style.setProperty('--rec-ms', '5000ms');
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
  el.micLabel.textContent = voiceReady ? 'Appuie et parle' : 'Micro indisponible';
}

function evaluate(heardText, alternatives = []) {
  const target = current();
  if (target === null) return;

  const tries = alternatives.length ? alternatives : [heardText];
  const results = tries.map((text) => matchNumber(text, target));
  const ok = results.some((r) => r.ok);
  const heard = results.find((r) => r.ok)?.heard ?? results[0]?.heard ?? null;

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
