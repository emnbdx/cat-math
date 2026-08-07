/**
 * La boîte de dialogue façon Game Boy : texte qui s'écrit lettre par lettre,
 * petit triangle clignotant, et menus à curseur ▶.
 */

import { onPress } from './input.js';
import { blip } from './audio.js';

const box = document.getElementById('dialog');
const textEl = document.getElementById('dialog-text');
const moreEl = document.getElementById('dialog-more');
const menuEl = document.getElementById('dialog-menu');

const SPEED = 22; // ms par caractère

let open = false;

export function isOpen() {
  return open;
}

export function close() {
  open = false;
  box.hidden = true;
  menuEl.hidden = true;
  menuEl.replaceChildren();
}

/** Affiche une suite de répliques. Résolue quand tout a été lu. */
export function say(lines, { face = null } = {}) {
  const queue = Array.isArray(lines) ? [...lines] : [lines];
  open = true;
  box.hidden = false;
  menuEl.hidden = true;
  box.classList.toggle('has-face', Boolean(face));
  setFace(face);

  return new Promise((resolve) => {
    let typing = null;
    let shown = '';
    let full = '';

    const type = () => {
      full = queue.shift();
      shown = '';
      textEl.textContent = '';
      moreEl.hidden = true;
      clearInterval(typing);
      typing = setInterval(() => {
        shown = full.slice(0, shown.length + 1);
        textEl.textContent = shown;
        if (shown.length >= full.length) {
          clearInterval(typing);
          typing = null;
          moreEl.hidden = false;
        }
      }, SPEED);
    };

    const off = onPress((button) => {
      if (button !== 'a' && button !== 'b') return;
      blip();
      if (typing) {
        // premier appui : on affiche la réplique en entier
        clearInterval(typing);
        typing = null;
        textEl.textContent = full;
        moreEl.hidden = false;
        return;
      }
      if (queue.length) {
        type();
        return;
      }
      off();
      moreEl.hidden = true;
      // la boîte disparaît : si un menu suit, il la rouvrira aussitôt
      close();
      resolve();
    });

    type();
  });
}

/**
 * Menu à choix. Renvoie l'indice choisi, ou -1 si le joueur annule (bouton B)
 * quand `cancel` est autorisé.
 */
export function choose(prompt, options, { cancel = false, face = null } = {}) {
  open = true;
  box.hidden = false;
  box.classList.toggle('has-face', Boolean(face));
  setFace(face);
  textEl.textContent = prompt;
  moreEl.hidden = true;

  menuEl.hidden = false;
  menuEl.replaceChildren(
    ...options.map((label, i) => {
      const li = document.createElement('li');
      li.className = 'dialog__item';
      li.textContent = label;
      li.dataset.index = String(i);
      return li;
    }),
  );

  let index = 0;
  const items = [...menuEl.children];
  const paint = () => items.forEach((li, i) => li.classList.toggle('is-active', i === index));
  paint();

  return new Promise((resolve) => {
    const finish = (value) => {
      off();
      close();
      resolve(value);
    };

    const off = onPress((button) => {
      if (button === 'up' || button === 'left') {
        index = (index - 1 + items.length) % items.length;
        blip();
        paint();
      } else if (button === 'down' || button === 'right') {
        index = (index + 1) % items.length;
        blip();
        paint();
      } else if (button === 'a') {
        blip();
        finish(index);
      } else if (button === 'b' && cancel) {
        blip();
        finish(-1);
      }
    });

    // au doigt / à la souris
    menuEl.addEventListener(
      'click',
      (e) => {
        const li = e.target.closest('.dialog__item');
        if (!li) return;
        blip();
        finish(Number(li.dataset.index));
      },
      { once: true },
    );
  });
}

function setFace(svg) {
  const faceEl = document.getElementById('dialog-face');
  if (!faceEl) return;
  faceEl.hidden = !svg;
  faceEl.innerHTML = svg ?? '';
}
