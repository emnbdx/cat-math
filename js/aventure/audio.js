/**
 * Bruitages « chiptune » générés en Web Audio : aucun fichier à héberger.
 */

import { save } from './save.js';

let ctx = null;

function audio() {
  if (!save.sound) return null;
  if (!ctx) {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(freq, start, duration, { type = 'square', gain = 0.07 } = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const blip = () => note(880, 0, 0.05, { gain: 0.04 });
export const step = () => note(220, 0, 0.03, { type: 'triangle', gain: 0.025 });

export function encounter() {
  note(392, 0, 0.08);
  note(523, 0.08, 0.08);
  note(392, 0.16, 0.08);
  note(659, 0.24, 0.2);
}

export function success() {
  note(523, 0, 0.1);
  note(659, 0.09, 0.1);
  note(784, 0.18, 0.1);
  note(1047, 0.27, 0.28);
}

export function fail() {
  note(330, 0, 0.12, { type: 'sawtooth', gain: 0.05 });
  note(247, 0.11, 0.22, { type: 'sawtooth', gain: 0.05 });
}

export function caught() {
  note(784, 0, 0.09);
  note(988, 0.09, 0.09);
  note(1319, 0.19, 0.32);
  note(1047, 0.19, 0.32, { gain: 0.04 });
}
