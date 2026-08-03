/**
 * Petits sons de récompense, générés en Web Audio (aucun fichier à héberger).
 */

import { state } from './state.js';

let ctx = null;

function audio() {
  if (!state.sound) return null;
  if (!ctx) {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  // Sur mobile le contexte démarre suspendu jusqu'à la première interaction.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(freq, start, duration, { type = 'sine', gain = 0.14 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Arpège montant : bonne réponse. */
export function success() {
  note(659, 0, 0.14);
  note(784, 0.09, 0.14);
  note(1047, 0.18, 0.26);
}

/** Deux notes descendantes, douces : erreur (jamais punitif). */
export function failure() {
  note(392, 0, 0.18, { type: 'triangle', gain: 0.1 });
  note(294, 0.13, 0.26, { type: 'triangle', gain: 0.1 });
}

/** Petit « pop » de confirmation. */
export function pop() {
  note(880, 0, 0.08, { type: 'square', gain: 0.05 });
}

/** Fanfare de fin de partie. */
export function fanfare() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, i * 0.11, 0.3));
}

export function startRecordCue() {
  note(1047, 0, 0.09, { type: 'sine', gain: 0.08 });
}
