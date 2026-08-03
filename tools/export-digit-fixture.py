#!/usr/bin/env python3
"""
Fabrique tools/digit-fixture.json : 20 chiffres du jeu de test MNIST (deux par
classe) avec les probabilités calculées par le modèle Python.

C'est la référence de tools/test-digits.mjs, qui rejoue les mêmes entrées à
travers l'inférence JavaScript et compare. Un mauvais agencement des poids
entre Python et JS produirait des résultats plausibles mais faux — ce test
l'attrape.

  python3 tools/export-digit-fixture.py --data /chemin/vers/mnist
"""

import argparse
import base64
import importlib.util
import json
import pathlib

import numpy as np

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("td", HERE / "train-digits.py")
td = importlib.util.module_from_spec(spec)
spec.loader.exec_module(td)

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--model", default="data/digit-model.json")
ap.add_argument("--out", default="tools/digit-fixture.json")
args = ap.parse_args()

raw = json.loads(pathlib.Path(args.model).read_text())
shapes = raw["shapes"]
params = {k: np.array(raw[k], dtype=np.float64).reshape(shapes[k]) for k in shapes}

data = td.load_mnist(args.data)
images, labels = data["xte"], data["yte"]

picked = []
for digit in range(10):
    idx = np.flatnonzero(labels == digit)[:2]
    picked.extend(int(i) for i in idx)

samples = []
for i in picked:
    x = (images[i].astype(np.float64) / 255.0)[None, None, :, :]
    logits, _ = td.forward(params, x)
    _, _, probs = td.softmax_ce(logits, np.array([labels[i]]))
    samples.append({
        "label": int(labels[i]),
        # 784 octets bruts, en base64 : compact et sans perte
        "pixels": base64.b64encode(images[i].tobytes()).decode("ascii"),
        "probs": [round(float(p), 6) for p in probs[0]],
    })

out = pathlib.Path(args.out)
out.write_text(json.dumps({
    "note": "Référence produite par tools/export-digit-fixture.py — ne pas éditer à la main.",
    "samples": samples,
}, separators=(",", ":")), encoding="utf8")
print(f"→ {out} ({out.stat().st_size / 1024:.0f} Ko, {len(samples)} chiffres)")
