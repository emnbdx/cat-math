/**
 * Briques d'interface partagées par les deux modes : carte de récompense,
 * particules, compteur de chats, fiche d'un chat.
 */

import { catArt } from './cats.js';

const particles = document.getElementById('particles');
const countBox = document.getElementById('catcount');
const countValue = document.getElementById('catcount-value');
const sheet = document.getElementById('cat-sheet');
const sheetBody = document.getElementById('cat-sheet-body');

/** Met à jour le compteur du bandeau, avec une animation selon le sens. */
export function setCatCount(n, direction = null) {
  countBox.hidden = false;
  countValue.textContent = String(n);
  countBox.classList.remove('is-up', 'is-down');
  if (direction) {
    void countBox.offsetWidth;
    countBox.classList.add(direction > 0 ? 'is-up' : 'is-down');
  }
}

export function hideCatCount() {
  countBox.hidden = true;
}

/** Affiche le chat gagné (ou perdu) dans la zone de récompense. */
export function showReward(host, cat, { lost = false } = {}) {
  const card = document.createElement('div');
  card.className = `reward__card${lost ? ' reward--lost' : ''}`;

  const art = document.createElement('div');
  art.className = 'reward__art';
  art.append(catArt(cat));

  const name = document.createElement('span');
  name.className = 'reward__name';
  name.textContent = lost ? `${cat.name} s’en va…` : cat.name;

  const sub = document.createElement('span');
  sub.className = 'reward__sub';
  sub.textContent = lost ? 'Il revient si tu réussis !' : `${cat.expression} · ${cat.fur}`;

  card.append(art, name, sub);
  host.replaceChildren(card);
}

/** Message simple dans la zone de récompense. */
export function showMessage(host, text) {
  const p = document.createElement('p');
  p.className = 'reward__sub';
  p.textContent = text;
  host.replaceChildren(p);
}

export function clearReward(host) {
  host.replaceChildren();
}

/** Petite gerbe d'émojis depuis un élément. */
export function burst(fromEl, emojis = ['🐾', '⭐', '💛', '🐱']) {
  if (!fromEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = fromEl.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  for (let i = 0; i < 10; i++) {
    const span = document.createElement('span');
    span.className = 'particle';
    span.textContent = emojis[i % emojis.length];
    span.style.left = `${cx}px`;
    span.style.top = `${cy}px`;
    span.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
    span.style.setProperty('--dy', `${-80 - Math.random() * 150}px`);
    span.style.setProperty('--rot', `${(Math.random() - 0.5) * 540}deg`);
    span.style.animationDelay = `${i * 0.03}s`;
    particles.append(span);
    setTimeout(() => span.remove(), 1200);
  }
}

/** Fiche détaillée d'un chat de la collection. */
export function openCatSheet(cat) {
  const art = document.createElement('div');
  art.className = 'sheet__art';
  art.append(catArt(cat));

  const name = document.createElement('h2');
  name.className = 'sheet__name';
  name.textContent = cat.name;

  const meta = document.createElement('p');
  meta.className = 'sheet__meta';
  meta.textContent = `Chat n°${cat.id} · ${cat.expression}`;

  const detail = document.createElement('p');
  detail.className = 'sheet__meta';
  detail.textContent = `Robe ${cat.fur}, porte ${cat.accessory}.`;

  sheetBody.replaceChildren(art, name, meta, detail);
  if (typeof sheet.showModal === 'function') sheet.showModal();
}

sheet.addEventListener('click', (event) => {
  // clic sur le fond ou sur la croix → fermeture
  if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
});
