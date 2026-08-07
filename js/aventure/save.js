/**
 * Sauvegarde de l'aventure, dans sa propre clé localStorage : la progression
 * du jeu principal (« Les 100 chats ») n'est jamais touchée.
 */

import { START } from './world.js';

const KEY = 'cent-chats:aventure:v1';

function fresh() {
  return {
    caught: [], // identifiants des chats capturés, dans l'ordre
    seen: [], // rencontrés, capturés ou non
    sound: true,
    pos: { x: START.x, y: START.y, dir: 'down' },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const saved = JSON.parse(raw);
    const base = fresh();
    return {
      caught: Array.isArray(saved.caught) ? saved.caught : base.caught,
      seen: Array.isArray(saved.seen) ? saved.seen : base.seen,
      sound: saved.sound ?? base.sound,
      pos: { ...base.pos, ...(saved.pos ?? {}) },
    };
  } catch {
    return fresh();
  }
}

export const save = load();

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* mode privé : tant pis, la partie reste jouable */
  }
}

export function isCaught(id) {
  return save.caught.includes(id);
}

export function markSeen(id) {
  if (!save.seen.includes(id)) {
    save.seen.push(id);
    persist();
  }
}

export function addCat(id) {
  if (!isCaught(id)) {
    save.caught.push(id);
    persist();
  }
}

export function reset() {
  Object.assign(save, fresh());
  persist();
}
