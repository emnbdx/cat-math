/**
 * Les questions posées au moment de la capture.
 *
 * On reste dans l'esprit du jeu principal : les nombres jusqu'à 100, lus,
 * comparés, décomposés en dizaines et unités.
 */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept',
  'dix-huit', 'dix-neuf',
];
const TENS = [
  '', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante',
  'quatre-vingt', 'quatre-vingt',
];

/** Écrit un nombre de 0 à 100 en toutes lettres (français standard). */
export function spell(n) {
  if (n === 100) return 'cent';
  if (n < 20) return UNITS[n];
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  const base = TENS[ten];
  if (ten === 7 || ten === 9) {
    const rest = UNITS[10 + unit];
    if (ten === 7 && unit === 1) return 'soixante-et-onze';
    return `${base}-${rest}`;
  }
  if (unit === 0) return ten === 8 ? 'quatre-vingts' : base;
  if (unit === 1 && ten !== 8) return `${base}-et-un`;
  return `${base}-${UNITS[unit]}`;
}

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Mélange sur place, façon Fisher-Yates. */
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const MAKERS = [
  () => {
    const n = rand(1, 99);
    return { question: `Quel nombre vient juste après ${n} ?`, answer: n + 1, decoys: [n - 1, n + 2, n + 10] };
  },
  () => {
    const n = rand(2, 100);
    return { question: `Quel nombre vient juste avant ${n} ?`, answer: n - 1, decoys: [n + 1, n - 2, n - 10] };
  },
  () => {
    const a = rand(10, 89);
    const b = rand(1, 9);
    return { question: `Combien font ${a} + ${b} ?`, answer: a + b, decoys: [a + b + 1, a + b - 1, a + b + 10] };
  },
  () => {
    const a = rand(1, 8) * 10;
    const b = rand(1, 10 - a / 10) * 10;
    return { question: `Combien font ${a} + ${b} ?`, answer: a + b, decoys: [a + b + 10, a + b - 10, a + b + 1] };
  },
  () => {
    const n = rand(21, 99);
    return {
      question: `Combien y a-t-il de dizaines dans ${n} ?`,
      answer: Math.floor(n / 10),
      decoys: [n % 10, Math.floor(n / 10) + 1, Math.floor(n / 10) - 1],
    };
  },
  () => {
    const n = rand(11, 99);
    return { question: `Quel nombre s’écrit « ${spell(n)} » ?`, answer: n, decoys: [n + 10, n - 10, Number(String(n).split('').reverse().join(''))] };
  },
  () => {
    const n = rand(1, 90);
    return { question: `Quel nombre vient 10 cases plus loin que ${n} ?`, answer: n + 10, decoys: [n + 1, n - 10, n + 20] };
  },
];

/**
 * Une question à choix. `easy` réduit le nombre de propositions : c'est ce
 * qu'on gagne en caressant le chat avant de lui proposer une croquette.
 */
export function makeQuestion({ easy = false } = {}) {
  const { question, answer, decoys } = pick(MAKERS)();
  const wanted = easy ? 1 : 2;

  const options = [answer];
  for (const d of shuffle([...decoys])) {
    if (options.length > wanted) break;
    if (d !== answer && d >= 0 && d <= 110 && !options.includes(d)) options.push(d);
  }
  // filet de sécurité si les leurres se ressemblaient trop
  let guard = 0;
  while (options.length <= wanted && guard++ < 40) {
    const d = Math.max(0, answer + rand(-12, 12));
    if (d !== answer && !options.includes(d)) options.push(d);
  }

  return { question, answer, options: shuffle(options) };
}
