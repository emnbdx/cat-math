/**
 * Reconnaissance des nombres 1 → 100 dans une transcription française.
 *
 * Whisper peut renvoyer « 72 », « soixante-douze », « c'est soixante douze ! »
 * ou encore la variante belge « septante-deux ». On extrait donc tous les
 * nombres présents dans la phrase, en chiffres comme en lettres.
 */

const WORDS = new Map(Object.entries({
  zero: 0, zéro: 0,
  un: 1, une: 1, uns: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20, vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  // variantes belges / suisses
  septante: 70,
  octante: 80, huitante: 80,
  nonante: 90,
  cent: 100, cents: 100,
}));

/** Homophones fréquents dans les transcriptions d'enfants. */
const ALIASES = new Map(Object.entries({
  sang: 'cent', sans: 'cent', sent: 'cent', san: 'cent',
  cet: 'sept', cette: 'sept', set: 'sept',
  sink: 'cinq', cinque: 'cinq',
  size: 'six', cis: 'six',
  nef: 'neuf',
  dis: 'dix', disent: 'dix',
  vint: 'vingt', vin: 'vingt', vain: 'vingt',
  cate: 'quatre', quatres: 'quatre',
  onzes: 'onze', douzes: 'douze',
}));

/** Mots à ignorer entre deux mots-nombres, sans casser la séquence. */
const GLUE = new Set(['et', 'e', 'euh', 'heu', 'hum']);

/** minuscules, sans accents, sans ponctuation, tirets → espaces. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019']/g, ' ')
    .replace(/[-\u2013\u2014_]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tous les nombres trouvés dans le texte, dans l'ordre d'apparition.
 * @returns {number[]}
 */
export function extractNumbers(text) {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const found = [];

  let run = [];   // suite courante de valeurs de mots-nombres
  let sawWord = false;

  const flush = () => {
    if (run.length) found.push(sumRun(run));
    run = [];
    sawWord = false;
  };

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];

    // chiffres écrits tels quels
    if (/^\d+$/.test(raw)) {
      flush();
      found.push(Number(raw));
      continue;
    }

    const word = ALIASES.get(raw) ?? raw;

    if (GLUE.has(word)) {
      // « vingt et un » : le liant ne coupe pas la séquence
      if (!sawWord) flush();
      continue;
    }

    if (WORDS.has(word)) {
      // « quatre-vingt… » : quatre suivi de vingt vaut 80
      if (word === 'quatre' && (ALIASES.get(tokens[i + 1]) ?? tokens[i + 1])?.startsWith('vingt')) {
        run.push(80);
        i++;
      } else {
        run.push(WORDS.get(word));
      }
      sawWord = true;
      continue;
    }

    flush();
  }
  flush();

  return found;
}

/**
 * Additionne une suite de mots-nombres.
 * Suffisant jusqu'à 100 : « soixante douze » = 72, « quatre vingt dix neuf » = 99.
 */
function sumRun(values) {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * L'enfant a-t-il dit `expected` ?
 * On est volontairement tolérant : si le bon nombre apparaît quelque part dans
 * la phrase (« euh… je crois que c'est 42 »), c'est validé.
 *
 * @returns {{ ok: boolean, heard: number|null, all: number[] }}
 */
export function matchNumber(text, expected) {
  const all = extractNumbers(text);
  return {
    ok: all.includes(expected),
    heard: all.length ? all[all.length - 1] : null,
    all,
  };
}
