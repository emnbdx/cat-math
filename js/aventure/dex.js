/**
 * La boîte à chats : les 100 cases, façon PC du Centre Pokémon.
 * 50 cases par boîte, la fiche du chat sélectionné s'affiche en dessous.
 */

import { catSvg, getCat } from '../cats.js';
import { catSprite } from './sprites.js';
import { sheet } from './catinfo.js';
import { isCaught, save } from './save.js';
import { onPress } from './input.js';
import { blip } from './audio.js';

const PER_BOX = 50;
const COLS = 10;
const BOXES = Math.ceil(100 / PER_BOX);

const titleEl = document.getElementById('box-title');
const gridEl = document.getElementById('box-grid');
const detailEl = document.getElementById('box-detail');
const countEl = document.getElementById('box-count');

let box = 0;
let cursor = 0; // indice dans la boîte courante
let offPress = null;

const dataUrls = new Map();

/** Sprite de carte, converti une fois en image pour la grille. */
function spriteUrl(cat) {
  if (!dataUrls.has(cat.id)) dataUrls.set(cat.id, catSprite(cat, 0).toDataURL());
  return dataUrls.get(cat.id);
}

export function open() {
  // on ouvre sur le dernier chat capturé : c'est celui qu'on veut revoir
  const last = save.caught[save.caught.length - 1];
  if (last) {
    box = Math.floor((last - 1) / PER_BOX);
    cursor = (last - 1) % PER_BOX;
  }
  render();
  offPress = onPress(handlePress);
}

export function close() {
  offPress?.();
  offPress = null;
}

function idAt(index) {
  return box * PER_BOX + index + 1;
}

function handlePress(button) {
  const slots = slotCount();
  if (button === 'left') move(-1);
  else if (button === 'right') move(1);
  else if (button === 'up') move(-COLS);
  else if (button === 'down') move(COLS);
  else if (button === 'a') {
    blip();
    select(Math.min(cursor, slots - 1));
  }
}

function slotCount() {
  return Math.min(PER_BOX, 100 - box * PER_BOX);
}

function move(step) {
  const slots = slotCount();
  let next = cursor + step;
  if (next < 0) {
    if (box > 0) {
      box--;
      next = Math.min(slotCount() - 1, next + PER_BOX);
    } else next = 0;
    render();
  } else if (next >= slots) {
    if (box < BOXES - 1) {
      box++;
      next -= slots;
      next = Math.min(next, slotCount() - 1);
    } else next = slots - 1;
    render();
  }
  blip();
  select(Math.max(0, next));
}

function select(index) {
  cursor = index;
  [...gridEl.children].forEach((cell, i) => cell.classList.toggle('is-active', i === index));
  showDetail(idAt(index));
}

function showDetail(id) {
  const cat = getCat(id);
  if (!cat) return;

  if (!isCaught(id)) {
    detailEl.innerHTML = `
      <div class="detail__art detail__art--unknown">?</div>
      <div class="detail__info">
        <p class="detail__name">Chat inconnu</p>
        <p class="detail__num">N°${String(id).padStart(3, '0')}</p>
        <p class="detail__row">Pas encore rencontré.</p>
        <p class="detail__row detail__hint">Va explorer les hautes herbes !</p>
      </div>`;
    return;
  }

  const info = sheet(cat);
  detailEl.innerHTML = `
    <div class="detail__art">${catSvg(cat)}</div>
    <div class="detail__info">
      <p class="detail__name">${cat.name} <span class="detail__gender">${info.gender}</span>
        <span class="detail__num">${info.number}</span></p>
      <p class="detail__row">Type : <span class="tag">${info.type}</span></p>
      <p class="detail__row">Talent : ${info.talent}</p>
      <p class="detail__row">Aime : ${info.likes}</p>
    </div>`;
}

export function render() {
  titleEl.textContent = `Boîte ${box + 1}`;
  countEl.textContent = `${save.caught.length} chats sur 100`;

  const cells = [];
  for (let i = 0; i < slotCount(); i++) {
    const id = idAt(i);
    const cat = getCat(id);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'box__cell';
    cell.dataset.index = String(i);
    if (cat && isCaught(id)) {
      const img = document.createElement('img');
      img.src = spriteUrl(cat);
      img.alt = cat.name;
      cell.append(img);
    } else {
      cell.classList.add('is-empty');
    }
    cells.push(cell);
  }
  gridEl.replaceChildren(...cells);
  select(Math.min(cursor, cells.length - 1));
}

gridEl.addEventListener('click', (e) => {
  const cell = e.target.closest('.box__cell');
  if (!cell) return;
  blip();
  select(Number(cell.dataset.index));
});

document.getElementById('box-prev').addEventListener('click', () => {
  box = (box - 1 + BOXES) % BOXES;
  cursor = 0;
  blip();
  render();
});

document.getElementById('box-next').addEventListener('click', () => {
  box = (box + 1) % BOXES;
  cursor = 0;
  blip();
  render();
});
