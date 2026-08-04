/**
 * Ardoise : l'enfant écrit un nombre au doigt, un chiffre par cadre.
 *
 * Un cadre par chiffre (centaines / dizaines / unités) : on ne découpe jamais
 * un gribouillage en plusieurs chiffres, ce qui rend la reconnaissance beaucoup
 * plus fiable — et ça colle au découpage décimal que le tableau enseigne.
 */

import { canvasToInput, checkDigit } from './digits.js';

const PLACES = ['unités', 'dizaines', 'centaines'];
const CANVAS_SIZE = 256;

const pad = document.getElementById('writepad');
const title = document.getElementById('writepad-title');
const boxesHost = document.getElementById('writepad-boxes');
const feedback = document.getElementById('writepad-feedback');
const validateBtn = document.getElementById('writepad-validate');
const clearBtn = document.getElementById('writepad-clear');

let boxes = [];               // { canvas, ctx, ink, digit, place }
let onValidate = null;
let expected = null;

/**
 * Ouvre l'ardoise pour un nombre donné.
 * @param {number} value      le nombre attendu (celui de la case choisie)
 * @param {(res: {ok: boolean, digits: (number|null)[]}) => boolean} validate
 *        appelé à chaque « Valider » ; renvoie true pour fermer l'ardoise.
 */
export function openPad(value, validate) {
  expected = value;
  onValidate = validate;

  const digits = String(value).split('').map(Number);
  title.textContent = `Écris le nombre de cette case`;
  buildBoxes(digits);
  feedback.textContent = digits.length > 1
    ? 'Un chiffre par cadre.'
    : 'Trace le chiffre dans le cadre.';
  feedback.className = 'writepad__feedback';
  validateBtn.disabled = true;

  if (typeof pad.showModal === 'function') pad.showModal();
  else pad.setAttribute('open', '');
}

export function closePad() {
  boxes = [];
  onValidate = null;
  if (pad.open) pad.close();
}

/* --------------------------------------------------------------- cadres --- */

function buildBoxes(digits) {
  boxesHost.replaceChildren();
  boxesHost.style.setProperty('--boxes', String(digits.length));
  boxes = digits.map((digit, i) => {
    const place = PLACES[digits.length - 1 - i] ?? '';

    const wrap = document.createElement('div');
    wrap.className = 'writebox';

    const label = document.createElement('span');
    label.className = 'writebox__label';
    label.textContent = place;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    canvas.className = 'writebox__canvas';
    canvas.setAttribute('aria-label', `Écris le chiffre des ${place}`);

    const mark = document.createElement('span');
    mark.className = 'writebox__mark';

    wrap.append(label, canvas, mark);
    boxesHost.append(wrap);

    const box = { canvas, ctx: setupCanvas(canvas), ink: false, digit, wrap, mark };
    attachDrawing(box);
    return box;
  });
}

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.lineWidth = CANVAS_SIZE * 0.085;   // ~14 px : l'épaisseur d'un doigt
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a3b45';
  return ctx;
}

function attachDrawing(box) {
  const { canvas, ctx } = box;
  let drawing = false;

  const at = (event) => {
    const r = canvas.getBoundingClientRect();
    return [
      ((event.clientX - r.left) / r.width) * canvas.width,
      ((event.clientY - r.top) / r.height) * canvas.height,
    ];
  };

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const [x, y] = at(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // un simple appui laisse un point : utile pour les tracés courts
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
    box.ink = true;
    box.wrap.classList.remove('is-ok', 'is-ko');
    box.mark.textContent = '';
    validateBtn.disabled = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    event.preventDefault();
    const [x, y] = at(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    canvas.addEventListener(type, () => { drawing = false; });
  }
}

/** Efface l'encre seulement : la marque ✗ reste visible pour guider l'enfant. */
function clearInk(box) {
  box.ctx.clearRect(0, 0, box.canvas.width, box.canvas.height);
  box.ink = false;
}

function clearBox(box) {
  clearInk(box);
  box.wrap.classList.remove('is-ok', 'is-ko');
  box.mark.textContent = '';
}

function clearAll() {
  boxes.forEach(clearBox);
  validateBtn.disabled = true;
  feedback.textContent = 'À toi !';
  feedback.className = 'writepad__feedback';
}

/* ------------------------------------------------------------ validation - */

function validate() {
  const empty = boxes.filter((b) => !b.ink);
  if (empty.length) {
    feedback.textContent = boxes.length > 1
      ? 'Il manque un chiffre dans un cadre.'
      : 'Trace le chiffre dans le cadre.';
    feedback.className = 'writepad__feedback is-warn';
    empty.forEach((b) => b.wrap.classList.add('is-ko'));
    return;
  }

  const results = boxes.map((box) => {
    const input = canvasToInput(box.canvas);
    if (!input) return { ok: false, best: null };
    return checkDigit(input, box.digit);
  });

  results.forEach((res, i) => {
    const box = boxes[i];
    box.wrap.classList.toggle('is-ok', res.ok);
    box.wrap.classList.toggle('is-ko', !res.ok);
    box.mark.textContent = res.ok ? '✓' : '✗';
  });

  const ok = results.every((r) => r.ok);
  const digits = results.map((r) => r.best);

  if (ok) {
    feedback.textContent = `Bravo, c’est bien ${expected} !`;
    feedback.className = 'writepad__feedback is-ok';
  } else {
    const read = digits.every((d) => d !== null) ? digits.join('') : null;
    feedback.textContent = read !== null
      ? `J’ai lu ${read}… recommence le chiffre marqué ✗.`
      : 'Je n’arrive pas à lire ce chiffre, réessaie plus grand.';
    feedback.className = 'writepad__feedback is-ko';
    // on n'efface que les chiffres ratés : le reste du travail est gardé,
    // et leur ✗ reste affiché jusqu'au prochain tracé
    boxes.forEach((box, i) => { if (!results[i].ok) clearInk(box); });
    validateBtn.disabled = boxes.every((b) => !b.ink);
  }

  const shouldClose = onValidate?.({ ok, digits });
  if (shouldClose) setTimeout(closePad, ok ? 550 : 0);
}

validateBtn.addEventListener('click', validate);
clearBtn.addEventListener('click', clearAll);

pad.addEventListener('click', (event) => {
  if (event.target === pad || event.target.closest('[data-close]')) closePad();
});
pad.addEventListener('close', () => { boxes = []; onValidate = null; });
