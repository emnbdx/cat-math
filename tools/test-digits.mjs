#!/usr/bin/env node
/**
 * Vérifie que l'inférence JavaScript reproduit exactement le modèle Python.
 *
 *   node tools/test-digits.mjs
 *
 * Les 20 chiffres de tools/digit-fixture.json sont rejoués à travers
 * js/digits.js et comparés aux probabilités de référence. Toute erreur
 * d'agencement des poids (ordre des canaux, transposition de la couche dense)
 * donnerait des résultats plausibles mais faux : ce test l'attrape.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// js/digits.js charge le modèle via fetch : en Node on le sert depuis le disque.
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')),
});

const { loadModel, predict, checkDigit } = await import('../js/digits.js');

const model = await loadModel();
const fixture = JSON.parse(readFileSync(join(ROOT, 'tools', 'digit-fixture.json'), 'utf8'));

let failed = 0;
let worstDiff = 0;
let correct = 0;

for (const [i, sample] of fixture.samples.entries()) {
  const bytes = Buffer.from(sample.pixels, 'base64');
  const input = Float32Array.from(bytes, (b) => b / 255);

  const probs = predict(input);

  // 1. les probabilités doivent coller à la référence Python
  let diff = 0;
  for (let d = 0; d < 10; d++) {
    diff = Math.max(diff, Math.abs(probs[d] - sample.probs[d]));
  }
  worstDiff = Math.max(worstDiff, diff);
  if (diff > 1e-3) {
    failed++;
    console.error(`❌ échantillon ${i} (chiffre ${sample.label}) : écart max ${diff.toExponential(2)}`);
    console.error(`   JS     ${[...probs].map((p) => p.toFixed(4)).join(' ')}`);
    console.error(`   Python ${sample.probs.map((p) => p.toFixed(4)).join(' ')}`);
  }

  // 2. et la prédiction doit être la bonne
  let best = 0;
  for (let d = 1; d < 10; d++) if (probs[d] > probs[best]) best = d;
  if (best === sample.label) correct++;

  // 3. checkDigit doit accepter le bon chiffre
  if (!checkDigit(input, sample.label).ok) {
    failed++;
    console.error(`❌ checkDigit refuse un vrai ${sample.label} (échantillon ${i})`);
  }
}

// 4. et refuser un chiffre franchement différent
const first = fixture.samples[0];
const wrongTarget = (first.label + 5) % 10;
const firstInput = Float32Array.from(Buffer.from(first.pixels, 'base64'), (b) => b / 255);
if (checkDigit(firstInput, wrongTarget).ok) {
  failed++;
  console.error(`❌ checkDigit accepte un ${wrongTarget} alors que c'est un ${first.label}`);
}

// 5. une entrée vide ne doit rien valider
if (checkDigit(new Float32Array(784), 3).ok) {
  failed++;
  console.error('❌ checkDigit accepte une zone vide');
}

console.log(`modèle : ${model.params ?? ''}précision annoncée ${(model.accuracy * 100).toFixed(2)}%`);
console.log(`écart max JS ↔ Python : ${worstDiff.toExponential(2)}`);
console.log(`prédictions correctes : ${correct}/${fixture.samples.length}`);

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('✅ inférence JS conforme au modèle Python');
