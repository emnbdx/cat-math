#!/usr/bin/env python3
"""
Entraîne le petit réseau de reconnaissance de chiffres et exporte ses poids
dans data/digit-model.json (lu par js/digits.js pour l'inférence dans le
navigateur).

  python3 tools/train-digits.py --data /chemin/vers/mnist

Architecture (9 098 paramètres, ~90 Ko de JSON) :
    28×28 → conv 8@3×3 → ReLU → maxpool 2 → conv 16@3×3 → ReLU → maxpool 2
          → dense 10 → softmax

Deux augmentations ciblent l'écriture au doigt, très différente de MNIST :
  - décalages ±2 px, parce qu'un doigt ne centre jamais parfaitement ;
  - épaississement du trait, parce qu'un doigt écrit beaucoup plus gras
    qu'un stylo.

Tout est en numpy : pas de framework à installer, et l'entraînement complet
tient en quelques minutes sur un CPU.
"""

import argparse
import gzip
import json
import pathlib
import sys

import numpy as np

rng = np.random.default_rng(1234)


# --------------------------------------------------------------- données ---

def load_idx(path):
    with gzip.open(path, "rb") as fh:
        magic = int.from_bytes(fh.read(4), "big")
        dims = magic & 0xFF
        shape = [int.from_bytes(fh.read(4), "big") for _ in range(dims)]
        return np.frombuffer(fh.read(), dtype=np.uint8).reshape(shape)


def load_mnist(root):
    root = pathlib.Path(root)
    need = {
        "xtr": "train-images-idx3-ubyte.gz",
        "ytr": "train-labels-idx1-ubyte.gz",
        "xte": "t10k-images-idx3-ubyte.gz",
        "yte": "t10k-labels-idx1-ubyte.gz",
    }
    missing = [f for f in need.values() if not (root / f).is_file()]
    if missing:
        sys.exit(f"Fichiers MNIST manquants dans {root} : {', '.join(missing)}")
    return {k: load_idx(root / f) for k, f in need.items()}


# ---------------------------------------------------------- augmentation ---

def shift_batch(x, max_px=2):
    """Décale chaque image de -max_px..+max_px pixels dans les deux axes."""
    out = np.zeros_like(x)
    dy = rng.integers(-max_px, max_px + 1, len(x))
    dx = rng.integers(-max_px, max_px + 1, len(x))
    for i in range(len(x)):
        out[i] = np.roll(np.roll(x[i], dy[i], axis=0), dx[i], axis=1)
    return out


def thicken(x):
    """Dilatation 3×3 : simule le trait large d'un doigt."""
    p = np.pad(x, ((0, 0), (1, 1), (1, 1)))
    best = x.copy()
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            np.maximum(best, p[:, dy:dy + 28, dx:dx + 28], out=best)
    return best


def augment(x):
    x = shift_batch(x)
    thick = rng.random(len(x)) < 0.35
    if thick.any():
        x[thick] = thicken(x[thick])
    return x


# ------------------------------------------------------------- couches ----

def im2col(x, k=3, pad=1):
    """(N,C,H,W) → (N, out_h*out_w, C*k*k) pour une convolution stride 1."""
    n, c, h, w = x.shape
    p = np.pad(x, ((0, 0), (0, 0), (pad, pad), (pad, pad)))
    windows = np.lib.stride_tricks.sliding_window_view(p, (k, k), axis=(2, 3))
    # (N, C, out_h, out_w, k, k) → (N, out_h*out_w, C*k*k)
    out_h, out_w = h + 2 * pad - k + 1, w + 2 * pad - k + 1
    return windows.transpose(0, 2, 3, 1, 4, 5).reshape(n, out_h * out_w, c * k * k)


def conv_forward(x, weight, bias):
    n, _, h, w = x.shape
    cout = weight.shape[0]
    cols = im2col(x)                                   # (N, HW, C*9)
    flat = weight.reshape(cout, -1).T                   # (C*9, cout)
    out = cols @ flat + bias                            # (N, HW, cout)
    return out.transpose(0, 2, 1).reshape(n, cout, h, w), cols


def conv_backward(dout, x, cols, weight):
    n, cout, h, w = dout.shape
    cin = weight.shape[1]
    d = dout.reshape(n, cout, h * w).transpose(0, 2, 1)     # (N, HW, cout)

    dw = np.einsum("nkc,nkd->cd", d, cols).reshape(weight.shape)
    db = d.sum(axis=(0, 1))

    # dx = convolution "pleine" de dout avec les noyaux retournés
    wf = weight[:, :, ::-1, ::-1].transpose(1, 0, 2, 3)     # (cin, cout, 3, 3)
    cols_d = im2col(dout)                                   # (N, HW, cout*9)
    dx = (cols_d @ wf.reshape(cin, -1).T.copy()).transpose(0, 2, 1).reshape(n, cin, h, w)
    return dx, dw, db


def maxpool_forward(x):
    n, c, h, w = x.shape
    r = x.reshape(n, c, h // 2, 2, w // 2, 2)
    out = r.max(axis=(3, 5))
    mask = r == out[:, :, :, None, :, None]
    return out, mask


def maxpool_backward(dout, mask, shape):
    n, c, h, w = shape
    d = dout[:, :, :, None, :, None] * mask
    # si deux pixels égaux au maximum, le gradient est partagé : on normalise
    d = d / np.maximum(mask.sum(axis=(3, 5))[:, :, :, None, :, None], 1)
    return d.reshape(n, c, h, w)


def softmax_ce(logits, y):
    z = logits - logits.max(axis=1, keepdims=True)
    e = np.exp(z)
    p = e / e.sum(axis=1, keepdims=True)
    loss = -np.log(np.maximum(p[np.arange(len(y)), y], 1e-12)).mean()
    d = p.copy()
    d[np.arange(len(y)), y] -= 1
    return loss, d / len(y), p


# ---------------------------------------------------------------- modèle ---

def init_params():
    def he(shape, fan_in):
        return (rng.standard_normal(shape) * np.sqrt(2.0 / fan_in)).astype(np.float64)

    return {
        "w1": he((8, 1, 3, 3), 9),
        "b1": np.zeros(8),
        "w2": he((16, 8, 3, 3), 72),
        "b2": np.zeros(16),
        "w3": he((16 * 7 * 7, 10), 784),
        "b3": np.zeros(10),
    }


def forward(p, x):
    a1, c1 = conv_forward(x, p["w1"], p["b1"])
    r1 = np.maximum(a1, 0)
    m1, mask1 = maxpool_forward(r1)
    a2, c2 = conv_forward(m1, p["w2"], p["b2"])
    r2 = np.maximum(a2, 0)
    m2, mask2 = maxpool_forward(r2)
    flat = m2.reshape(len(x), -1)
    logits = flat @ p["w3"] + p["b3"]
    cache = (x, c1, a1, r1, mask1, m1, c2, a2, r2, mask2, m2, flat)
    return logits, cache


def backward(p, cache, dlogits):
    x, c1, a1, r1, mask1, m1, c2, a2, r2, mask2, m2, flat = cache
    g = {}
    g["w3"] = flat.T @ dlogits
    g["b3"] = dlogits.sum(axis=0)

    dflat = dlogits @ p["w3"].T
    dm2 = dflat.reshape(m2.shape)
    dr2 = maxpool_backward(dm2, mask2, r2.shape)
    da2 = dr2 * (a2 > 0)
    dm1, g["w2"], g["b2"] = conv_backward(da2, m1, c2, p["w2"])
    dr1 = maxpool_backward(dm1, mask1, r1.shape)
    da1 = dr1 * (a1 > 0)
    _, g["w1"], g["b1"] = conv_backward(da1, x, c1, p["w1"])
    return g


def accuracy(p, x, y, batch=1000):
    good = 0
    for i in range(0, len(x), batch):
        logits, _ = forward(p, x[i:i + batch])
        good += (logits.argmax(axis=1) == y[i:i + batch]).sum()
    return good / len(x)


# ----------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="dossier contenant les .gz MNIST")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--out", default="data/digit-model.json")
    args = ap.parse_args()

    data = load_mnist(args.data)
    xtr = data["xtr"].astype(np.float64) / 255.0
    xte = (data["xte"].astype(np.float64) / 255.0)[:, None, :, :]
    ytr, yte = data["ytr"].astype(np.int64), data["yte"].astype(np.int64)
    print(f"train {xtr.shape[0]} · test {xte.shape[0]}")

    p = init_params()
    adam = {k: [np.zeros_like(v), np.zeros_like(v)] for k, v in p.items()}
    step = 0

    for epoch in range(1, args.epochs + 1):
        order = rng.permutation(len(xtr))
        running = 0.0
        for b, start in enumerate(range(0, len(order), args.batch), 1):
            idx = order[start:start + args.batch]
            xb = augment(xtr[idx].copy())[:, None, :, :]
            yb = ytr[idx]

            logits, cache = forward(p, xb)
            loss, dlogits, _ = softmax_ce(logits, yb)
            g = backward(p, cache, dlogits)

            step += 1
            for k in p:
                m, v = adam[k]
                m *= 0.9
                m += 0.1 * g[k]
                v *= 0.999
                v += 0.001 * g[k] ** 2
                mh = m / (1 - 0.9 ** step)
                vh = v / (1 - 0.999 ** step)
                p[k] -= args.lr * mh / (np.sqrt(vh) + 1e-8)

            running += loss
            if b % 100 == 0:
                print(f"  époque {epoch} lot {b:4d} — perte {running / b:.4f}", flush=True)

        acc = accuracy(p, xte, yte)
        print(f"époque {epoch} : perte {running / b:.4f} · précision test {acc * 100:.2f}%", flush=True)

    # Robustesse sur trait épais (le cas « doigt »), en plus du test standard
    thick = thicken(data["xte"].astype(np.float64) / 255.0)[:, None, :, :]
    print(f"précision sur traits épaissis : {accuracy(p, thick, yte) * 100:.2f}%")

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "arch": "conv8-pool-conv16-pool-fc10",
        "input": [1, 28, 28],
        "accuracy": round(float(accuracy(p, xte, yte)), 4),
        "params": int(sum(v.size for v in p.values())),
        **{k: np.round(v, 4).flatten().tolist() for k, v in p.items()},
        "shapes": {k: list(v.shape) for k, v in p.items()},
    }
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf8")
    print(f"→ {out} ({out.stat().st_size / 1024:.0f} Ko, {payload['params']} paramètres)")


if __name__ == "__main__":
    main()
