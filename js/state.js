/**
 * État du jeu, persisté dans localStorage.
 *
 * Chaque mode a sa propre progression et sa propre collection de 100 chats :
 * `deck` fixe l'ordre dans lequel les chats sont gagnés (tiré une fois, puis
 * stable), `cats` contient les identifiants déjà obtenus.
 */

const KEY = 'cent-chats:v1';

export const TOTAL = 100;

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshBuild() {
  return { queue: shuffled(TOTAL), placed: [], deck: shuffled(TOTAL), cats: [], errors: 0 };
}

function freshSpeak() {
  return { queue: shuffled(TOTAL), done: [], missed: [], deck: shuffled(TOTAL), cats: [], errors: 0 };
}

function fresh() {
  // engine : moteur vocal choisi dans les réglages. Le modèle local est le
  // défaut — gratuit, et la voix de l'enfant ne quitte pas l'appareil.
  return { sound: true, engine: 'local', build: freshBuild(), speak: freshSpeak() };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const saved = JSON.parse(raw);
    // Fusion défensive : une sauvegarde d'une version antérieure ne doit pas
    // casser le jeu, on complète simplement ce qui manque.
    const base = fresh();
    return {
      sound: saved.sound ?? base.sound,
      engine: saved.engine ?? base.engine,
      build: { ...base.build, ...(saved.build ?? {}) },
      speak: { ...base.speak, ...(saved.speak ?? {}) },
    };
  } catch {
    return fresh();
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* navigation privée / quota : le jeu continue, sans sauvegarde */
  }
}

export function resetMode(mode) {
  state[mode] = mode === 'build' ? freshBuild() : freshSpeak();
  save();
}

export function resetAll() {
  // les réglages survivent à un effacement de progression
  const { sound, engine } = state;
  Object.assign(state, fresh(), { sound, engine });
  save();
}

/** Ajoute le prochain chat du deck. Renvoie son id, ou null si complet. */
export function awardCat(mode) {
  const m = state[mode];
  if (m.cats.length >= TOTAL) return null;
  const id = m.deck[m.cats.length];
  m.cats.push(id);
  save();
  return id;
}

/** Retire le dernier chat gagné. Renvoie son id, ou null si la collection est vide. */
export function loseCat(mode) {
  const m = state[mode];
  m.errors++;
  const id = m.cats.pop() ?? null;
  save();
  return id;
}

export function catCount(mode) {
  return state[mode].cats.length;
}

/** Nombre de questions déjà traitées dans le mode (pour l'affichage). */
export function answered(mode) {
  return mode === 'build'
    ? state.build.placed.length
    : state.speak.done.length + state.speak.missed.length;
}
