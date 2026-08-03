#!/usr/bin/env node
/**
 * Tests du parseur de nombres français.
 *   node tools/test-fr-numbers.mjs
 */

import { extractNumbers, matchNumber } from '../js/fr-numbers.js';

const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const TEENS = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];

/** Orthographe française standard de 1 à 100, pour vérifier les 100 cas. */
function spell(n) {
  if (n === 100) return 'cent';
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens === 7 || tens === 9) {
    const base = tens === 7 ? 'soixante' : 'quatre-vingt';
    if (unit === 0) return `${base}-dix`;
    if (unit === 1) return tens === 7 ? 'soixante-et-onze' : 'quatre-vingt-onze';
    return `${base}-${TEENS[unit]}`;
  }
  const names = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante', 8: 'quatre-vingts' };
  const base = names[tens];
  if (unit === 0) return base;
  if (unit === 1 && tens !== 8) return `${base.replace(/s$/, '')}-et-un`;
  return `${base.replace(/s$/, '')}-${UNITS[unit]}`;
}

let failed = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error(`❌ ${label}\n   attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
  }
  return ok;
};

// 1 → 100 en lettres
for (let n = 1; n <= 100; n++) {
  check(`« ${spell(n)} » → ${n}`, extractNumbers(spell(n)), [n]);
}

// chiffres et phrases entières
check('chiffres', extractNumbers('72'), [72]);
check('phrase', extractNumbers("C'est soixante-douze !"), [72]);
check('hésitation', extractNumbers('euh… quarante-deux'), [42]);
check('préambule', extractNumbers('je crois que le nombre est 87'), [87]);
check('deux nombres', extractNumbers('soixante-deux, non, soixante-douze'), [62, 72]);

// variantes régionales
check('septante-deux', extractNumbers('septante-deux'), [72]);
check('nonante-neuf', extractNumbers('nonante-neuf'), [99]);
check('huitante', extractNumbers('huitante'), [80]);

// homophones
check('sang → cent', extractNumbers('sang'), [100]);
check('cette → sept', extractNumbers('cette'), [7]);

// non-nombres
check('rien', extractNumbers('bonjour le chat'), []);
check('vide', extractNumbers(''), []);
check('null', extractNumbers(null), []);

// matchNumber
check('match ok', matchNumber('soixante-douze', 72).ok, true);
check('match ko', matchNumber('soixante-deux', 72).ok, false);
check('match heard', matchNumber('vingt et un', 21).heard, 21);

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('✅ 118 tests OK (1→100 en lettres, phrases, variantes, homophones)');
