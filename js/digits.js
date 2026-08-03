/**
 * Reconnaissance de chiffres écrits au doigt — 100 % dans le navigateur.
 *
 * Le réseau (8 conv → pool → 16 conv → pool → dense 10, 9 098 paramètres) est
 * entraîné hors-ligne par tools/train-digits.py et livré dans data/digit-model.json.
 * Aucun appel réseau, aucune clé API : ce mode marche même sur un hébergement
 * statique.
 *
 * Le prétraitement reproduit exactement celui de MNIST — recadrage sur l'encre,
 * mise à l'échelle dans une boîte de 20 px, centrage sur le centre de masse dans
 * une image 28×28 — sinon le modèle voit des données qu'il n'a jamais vues.
 */

const MODEL_URL = new URL('../data/digit-model.json', import.meta.url);

let model = null;

export async function loadModel() {
  if (model) return model;
  const raw = await fetch(MODEL_URL).then((r) => {
    if (!r.ok) throw new Error(`digit-model.json introuvable (HTTP ${r.status})`);
    return r.json();
  });
  model = {
    w1: Float32Array.from(raw.w1),
    b1: Float32Array.from(raw.b1),
    w2: Float32Array.from(raw.w2),
    b2: Float32Array.from(raw.b2),
    w3: Float32Array.from(raw.w3),
    b3: Float32Array.from(raw.b3),
    accuracy: raw.accuracy,
  };
  return model;
}

export function isModelReady() {
  return model !== null;
}

/* ============================================================
   Prétraitement : canvas → vecteur 28×28 normalisé
   ============================================================ */

/**
 * @param {HTMLCanvasElement} canvas  zone de dessin (trait opaque sur transparent)
 * @returns {Float32Array|null} 784 valeurs dans [0,1], ou null si rien n'est dessiné
 */
export function canvasToInput(canvas) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const alpha = ctx.getImageData(0, 0, w, h).data;

  // 1. boîte englobante de l'encre
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;             // zone vide

  const boxW = maxX - minX + 1;
  const boxY = maxY - minY + 1;

  // 2. mise à l'échelle dans une boîte de 20 px, en gardant les proportions
  const scale = 20 / Math.max(boxW, boxY);
  const drawW = Math.max(1, Math.round(boxW * scale));
  const drawH = Math.max(1, Math.round(boxY * scale));

  const small = document.createElement('canvas');
  small.width = 28;
  small.height = 28;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(
    canvas,
    minX, minY, boxW, boxY,
    Math.round((28 - drawW) / 2), Math.round((28 - drawH) / 2), drawW, drawH,
  );

  const px = sctx.getImageData(0, 0, 28, 28).data;
  const grid = new Float32Array(784);
  for (let i = 0; i < 784; i++) grid[i] = px[i * 4 + 3] / 255;

  // 3. recentrage sur le centre de masse, comme dans MNIST
  let mass = 0, cx = 0, cy = 0;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      const v = grid[y * 28 + x];
      mass += v; cx += x * v; cy += y * v;
    }
  }
  if (mass === 0) return null;

  const shiftX = Math.round(13.5 - cx / mass);
  const shiftY = Math.round(13.5 - cy / mass);
  if (shiftX === 0 && shiftY === 0) return grid;

  const centred = new Float32Array(784);
  for (let y = 0; y < 28; y++) {
    const sy = y - shiftY;
    if (sy < 0 || sy > 27) continue;
    for (let x = 0; x < 28; x++) {
      const sx = x - shiftX;
      if (sx < 0 || sx > 27) continue;
      centred[y * 28 + x] = grid[sy * 28 + sx];
    }
  }
  return centred;
}

/* ============================================================
   Inférence (~300 000 multiplications : bien moins d'une ms)
   ============================================================ */

/** Convolution 3×3, pad 1, stride 1, suivie d'un ReLU. */
function convRelu(input, inC, size, weight, bias, outC) {
  const out = new Float32Array(outC * size * size);
  for (let oc = 0; oc < outC; oc++) {
    const base = oc * size * size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = bias[oc];
        for (let ic = 0; ic < inC; ic++) {
          const wBase = ((oc * inC + ic) * 3) * 3;
          const iBase = ic * size * size;
          for (let ky = 0; ky < 3; ky++) {
            const sy = y + ky - 1;
            if (sy < 0 || sy >= size) continue;
            for (let kx = 0; kx < 3; kx++) {
              const sx = x + kx - 1;
              if (sx < 0 || sx >= size) continue;
              sum += input[iBase + sy * size + sx] * weight[wBase + ky * 3 + kx];
            }
          }
        }
        out[base + y * size + x] = sum > 0 ? sum : 0;
      }
    }
  }
  return out;
}

/** Max-pooling 2×2, stride 2. */
function maxPool(input, channels, size) {
  const half = size / 2;
  const out = new Float32Array(channels * half * half);
  for (let c = 0; c < channels; c++) {
    const iBase = c * size * size;
    const oBase = c * half * half;
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const a = input[iBase + (y * 2) * size + x * 2];
        const b = input[iBase + (y * 2) * size + x * 2 + 1];
        const cc = input[iBase + (y * 2 + 1) * size + x * 2];
        const d = input[iBase + (y * 2 + 1) * size + x * 2 + 1];
        out[oBase + y * half + x] = Math.max(a, b, cc, d);
      }
    }
  }
  return out;
}

/**
 * Probabilités des 10 chiffres.
 * @param {Float32Array} input 784 valeurs (sortie de canvasToInput)
 * @returns {Float32Array} 10 probabilités
 */
export function predict(input) {
  if (!model) throw new Error('modèle non chargé');

  const c1 = convRelu(input, 1, 28, model.w1, model.b1, 8);
  const p1 = maxPool(c1, 8, 28);
  const c2 = convRelu(p1, 8, 14, model.w2, model.b2, 16);
  const p2 = maxPool(c2, 16, 14);

  const logits = new Float32Array(10);
  for (let o = 0; o < 10; o++) {
    let sum = model.b3[o];
    for (let i = 0; i < 784; i++) sum += p2[i] * model.w3[i * 10 + o];
    logits[o] = sum;
  }

  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  let total = 0;
  const probs = new Float32Array(10);
  for (let i = 0; i < 10; i++) {
    probs[i] = Math.exp(logits[i] - max);
    total += probs[i];
  }
  for (let i = 0; i < 10; i++) probs[i] /= total;
  return probs;
}

/**
 * Le tracé peut-il être le chiffre attendu ?
 *
 * On connaît déjà la réponse : la question n'est donc pas « quel chiffre ? »
 * mais « est-ce que ça peut être un 7 ? ». On accepte le meilleur score, ou la
 * deuxième place si elle reste crédible — un 7 un peu tordu passe, sans pour
 * autant valider n'importe quoi.
 *
 * @returns {{ok: boolean, best: number, confidence: number, expectedScore: number}}
 */
export function checkDigit(input, expected, { secondChance = 0.15 } = {}) {
  const probs = predict(input);
  let best = 0;
  for (let i = 1; i < 10; i++) if (probs[i] > probs[best]) best = i;

  let rank = 1;
  for (let i = 0; i < 10; i++) if (probs[i] > probs[expected]) rank++;

  return {
    ok: best === expected || (rank <= 2 && probs[expected] >= secondChance),
    best,
    confidence: probs[best],
    expectedScore: probs[expected],
  };
}
