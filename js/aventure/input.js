/**
 * Entrées : clavier (flèches / ZQSD / WASD, A = Espace ou Entrée, B = Échap)
 * et croix directionnelle tactile.
 *
 * `held` sert au déplacement (état maintenu), `onPress` aux menus et aux
 * dialogues (événement ponctuel).
 */

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyZ: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyQ: 'left',
  KeyD: 'right',
  Space: 'a',
  Enter: 'a',
  KeyE: 'a',
  Escape: 'b',
  Backspace: 'b',
  KeyX: 'b',
};

export const held = new Set();
const listeners = new Set();

export function onPress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function press(button) {
  for (const fn of [...listeners]) fn(button);
}

window.addEventListener('keydown', (e) => {
  const button = KEYMAP[e.code];
  if (!button) return;
  // on ne vole pas le clavier des champs de saisie
  if (e.target instanceof HTMLInputElement) return;
  e.preventDefault();
  if (!e.repeat) press(button);
  held.add(button);
});

window.addEventListener('keyup', (e) => {
  const button = KEYMAP[e.code];
  if (button) held.delete(button);
});

window.addEventListener('blur', () => held.clear());

/** Branche un bouton tactile (croix directionnelle, A, B). */
export function bindButton(el, button) {
  const down = (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    held.add(button);
    press(button);
    el.classList.add('is-down');
  };
  const up = () => {
    held.delete(button);
    el.classList.remove('is-down');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Direction demandée. On garde en mémoire la dernière touche *tapée* : sans
 * ça, une pression très brève (ou un clic sur la croix tactile) serait perdue
 * entre deux images.
 */
let tapped = null;

onPress((button) => {
  if (['up', 'down', 'left', 'right'].includes(button)) tapped = button;
});

export function direction() {
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (held.has(dir)) {
      tapped = null;
      return dir;
    }
  }
  const once = tapped;
  tapped = null;
  return once;
}

/** À appeler quand on quitte le monde : on ne garde pas de pas en attente. */
export function clearInput() {
  held.clear();
  tapped = null;
}
