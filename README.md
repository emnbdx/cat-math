# 🐱 Les 100 chats

Jeu éducatif d'inspiration Montessori autour du **tableau du cent** (table de
Seguin / table de 100). Deux modes, et à chaque bonne réponse un chat kawaii
rejoint la collection. À chaque erreur, un chat s'en va.

Site **statique** (HTML/CSS/JS sans build), avec un fichier PHP **optionnel**
pour ceux qui veulent Whisper. Se dépose tel quel sur un mutualisé OVH.

---

## Les deux modes

### 🧩 Construire la table

Le plateau part vide. On tire un nombre au hasard parmi ceux qui restent,
l'enfant touche la case où il doit aller.

- bonne case → **+1 chat**, la case se remplit en vert
- mauvaise case → **−1 chat**, la case tremble, et le nombre reste à placer
- après une erreur, un repère parlé s'affiche (« regarde la ligne des
  soixante-dix ») ; après deux, la bonne case clignote
- bouton **💡 Aide** : affiche tous les nombres en filigrane dans les cases vides
- chaque nombre n'est demandé qu'une fois → 100 placements, jusqu'à 100 chats

Bouton **✍️ Écrire** : bascule vers l'écriture au doigt. Là, c'est l'enfant qui
choisit une case vide, puis **écrit son nombre au doigt** — un cadre par chiffre
(centaines / dizaines / unités). L'exercice est inversé : il déduit le nombre de
la position, au lieu de déduire la position du nombre. Les deux façons de
répondre partagent la même table et la même collection, on peut alterner à tout
moment.

### 🎤 Dis le nombre

Le plateau est complet. Une case s'allume en jaune, l'enfant lit le nombre à
voix haute, et la transcription est comparée au nombre attendu.

- bonne réponse → **+1 chat**, la case passe en vert
- mauvaise → **−1 chat**, on affiche ce qui a été entendu, on peut réessayer
- **⏭ Passer** met le nombre de côté (case rose, pas de chat)
- **un nombre déjà tiré ne revient jamais**
- un souci technique (micro refusé, API indisponible) **ne coûte jamais de chat** :
  le bouton **⌨️ Clavier** permet de répondre en tapant le nombre

La reconnaissance accepte les chiffres (« 72 »), les lettres
(« soixante-douze »), les phrases entières (« euh… c'est soixante-douze ! »)
et les variantes régionales (« septante-deux », « nonante-neuf »).
Voir `js/fr-numbers.js` et ses tests.

#### Deux moteurs, au choix dans ⚙️ Réglages

Le moteur se choisit dans l'écran **Réglages**, qui affiche la disponibilité
réelle des deux sur l'appareil. **Le navigateur est le défaut** : gratuit et
sans rien à configurer.

| moteur | coût | clé API | navigateurs |
|---|---|---|---|
| ☁️ **Reconnaissance du navigateur** *(défaut)* | 0 | non | Chrome, Edge, Safari |
| 🤖 Whisper (OpenAI) | à la minute | oui | tous, Firefox compris |

Le navigateur a un avantage secondaire : la transcription arrive au fil de la
phrase, donc l'enfant voit les mots s'afficher pendant qu'il parle. Whisper,
lui, comprend mieux les voix jeunes.

Si le moteur choisi n'est pas disponible — ou tombe en panne en cours de partie —
le jeu prend l'autre et l'annonce sous le micro ; si aucun des deux ne répond,
l'enfant tape le nombre au clavier. Un souci technique ne coûte **jamais** de
chat.

Le jeu exploite aussi les **hypothèses multiples** que renvoie le navigateur
(`maxAlternatives`) : si le bon nombre apparaît dans l'une d'elles, c'est validé.
Gratuit, et ça rattrape pas mal d'approximations sur une voix jeune.

### ✍️ La reconnaissance d'écriture

Un petit réseau de neurones (9 098 paramètres, ~90 Ko) tourne **dans le
navigateur** : aucun appel réseau, aucune clé API, réponse instantanée. Ce mode
marche donc même sur un hébergement statique.

Trois choix qui le rendent fiable pour une main d'enfant :

- **un cadre par chiffre.** On ne découpe jamais un gribouillage en plusieurs
  chiffres : chaque cadre contient un chiffre isolé, exactement le format sur
  lequel le modèle est bon. Bonus : ça matérialise les dizaines et les unités.
- **on connaît déjà la réponse.** La question posée au modèle n'est pas « quel
  chiffre est-ce ? » mais « est-ce que ça peut être un 7 ? ». Un 7 tordu passe
  s'il arrive en deuxième position avec un score crédible — sans pour autant
  valider n'importe quoi (voir `checkDigit` dans `js/digits.js`).
- **entraînement adapté au doigt.** Le modèle est entraîné sur MNIST avec des
  décalages ±2 px et un épaississement du trait, parce qu'un doigt écrit
  beaucoup plus gras et beaucoup moins centré qu'un stylo.

Mesuré sur les 10 000 chiffres de test MNIST, avec le seuil retenu (0,15) :

| | chiffre juste rejeté | mauvais chiffre validé |
|---|---|---|
| traits normaux | 0,59 % | 0,40 % |
| traits épaissis (cas « doigt ») | 1,29 % | 0,92 % |

Le seuil penche volontairement du côté indulgent : un refus injustifié coûte un
chat et décourage, alors qu'une validation un peu généreuse ne casse rien.

Après une validation ratée, seuls les chiffres marqués ✗ sont effacés : l'enfant
ne recommence pas le travail déjà juste.

### 📚 La collection

Un album de 100 emplacements **par mode**, avec le nom de chaque chat. Les cases
non gagnées restent numérotées et grisées. La progression est enregistrée dans
le navigateur (`localStorage`) : on peut fermer l'onglet et reprendre plus tard.

---

## Installation sur un mutualisé OVH

1. Envoyer tout le dossier dans `www/` (ou un sous-dossier — les chemins sont
   relatifs, ça marche aussi dans `www/chats/`).
2. **Seulement si tu veux Whisper** (les autres moteurs vocaux n'ont besoin de
   rien), créer `api/config.php` :

   ```bash
   cp api/config.example.php api/config.php
   # puis éditer et coller la clé OpenAI
   ```

   Alternative sans fichier : décommenter `SetEnv OPENAI_API_KEY sk-...` dans
   `.htaccess`.
3. Vérifier que l'hébergement est en **PHP 8.1+** (le code utilise `match` et
   `never`) et que **cURL** est actif — c'est le cas par défaut chez OVH.

⚠️ **HTTPS obligatoire** pour le micro : les navigateurs bloquent
`getUserMedia` en HTTP. Le certificat gratuit d'OVH suffit.

Tout fonctionne **sans PHP et sans clé API**, y compris le mode voix avec le
moteur du navigateur : un simple hébergement statique suffit. Le PHP ne sert
qu'au moteur Whisper.

### Test en local

```bash
php -S localhost:8000
# puis http://localhost:8000
```

`localhost` est considéré comme sécurisé par les navigateurs : le micro
fonctionne aussi en local.

---

## Réentraîner le modèle d'écriture

Le modèle est livré dans `data/digit-model.json` : **rien à faire** pour que le
jeu fonctionne. Pour le régénérer :

```bash
pip install numpy
# récupérer les 4 fichiers .gz de MNIST dans un dossier, puis :
python3 tools/train-digits.py --data /chemin/vers/mnist
python3 tools/export-digit-fixture.py --data /chemin/vers/mnist   # référence de test
node tools/test-digits.mjs
```

Six époques suffisent (~5 min sur un CPU), et l'entraînement affiche aussi la
précision sur des traits volontairement épaissis — le cas « doigt ».

## Générer les 100 chats

Sans images, le jeu affiche des **chats SVG dessinés à la volée** (9 regards,
7 bouches, 6 robes, 10 palettes) — il est donc jouable immédiatement. Les PNG
générés les remplacent dès qu'ils sont présents.

La génération d'images vit dans l'app dédiée **`generate-avatar`**
(dossier frère `../generate-avatar/`). Une fois installée :

```bash
cd ../generate-avatar && npm i && npm link
export OPENAI_API_KEY=sk-...            # ou un .env à la racine de generate-avatar
generate-avatar -f data/cats.json -o assets/cats
# ou, depuis cat-math :
node tools/generate-cats.mjs            # wrapper → generate-avatar
```

Les images arrivent dans `assets/cats/cat-001.png` … `cat-100.png`, plus un
`manifest.json` que le front lit pour savoir lesquelles existent.

Options utiles :

```bash
generate-avatar -f data/cats.json -o assets/cats --dry-run
generate-avatar -f data/cats.json -o assets/cats --count=5
generate-avatar -f data/cats.json -o assets/cats --only=7,42,88
generate-avatar -f data/cats.json -o assets/cats --model=gpt-image-1
generate-avatar -f data/cats.json -o assets/cats --quality=high
generate-avatar -f data/cats.json -o assets/cats --resize=512
```

Le script est **reprenable** : il saute les fichiers déjà présents, réessaie
automatiquement sur 429/5xx, et affiche en fin de course la commande exacte pour
relancer les échecs.

### Unicité des 100 chats

`data/cats.json` est la source de vérité, produite par
`node tools/build-catalog.mjs`. Elle combine 20 robes × 25 expressions ×
20 accessoires × 6 poses de façon déterministe : comme ppcm(20, 25) = 100,
les 100 couples *(robe, expression)* sont tous différents — le script vérifie
d'ailleurs cette propriété avant d'écrire le fichier. Chaque chat a aussi son
prénom (Mochi, Praline, Réglisse, Chamallow…).

### Coûts

Deux postes à surveiller, à vérifier sur la page tarifs d'OpenAI le jour où tu
lances (les prix bougent) :

- **les images** : 100 générations, une seule fois. C'est le gros du budget ;
  commence par `--count=5` pour juger du rendu avant de lancer les 100.
- **la transcription** : nulle si tu restes sur le moteur du navigateur. Avec
  Whisper, `whisper-1` est facturé à la minute d'audio ; une
  réponse d'enfant fait ~2 secondes, donc une partie de 100 nombres représente
  quelques minutes d'audio au total.

Garde-fou côté serveur : `api/transcribe.php` limite à **90 requêtes par IP et
par 5 minutes** (large pour un enfant qui joue, borné si l'URL fuite). Réglable
via les constantes `RATE_LIMIT` / `RATE_WINDOW`.

---

## Structure

```
index.html                 les 4 écrans (accueil, 2 modes, collection)
css/style.css              tout le style
js/
  app.js                   navigation, collection, réglages
  state.js                 progression + collections (localStorage)
  board.js                 le plateau 10×10
  cats.js                  catalogue + chats SVG de repli
  mode-build.js            mode « Construire la table »
  mode-speak.js            mode « Dis le nombre »
  fr-numbers.js            « soixante-douze » → 72
  speech.js                les 2 moteurs vocaux derrière une seule interface
  settings.js              écran de réglages (choix du moteur, sons)
  digits.js                reconnaissance de chiffres (inférence dans le navigateur)
  writepad.js              l'ardoise : un cadre de dessin par chiffre
  audio.js                 MediaRecorder + envoi au serveur
  sfx.js                   sons (Web Audio, aucun fichier)
  ui.js                    récompenses, particules, fiche d'un chat
api/
  transcribe.php           relais vers Whisper (garde la clé côté serveur)
  config.example.php       à copier en config.php
data/cats.json             les 100 chats (généré, versionné)
data/digit-model.json      poids du réseau de reconnaissance (généré, versionné)
assets/cats/               les PNG générés (non versionnés)
tools/
  build-catalog.mjs        régénère data/cats.json
  generate-cats.mjs        wrapper → ../generate-avatar
  train-digits.py          entraîne le réseau de chiffres
  export-digit-fixture.py  référence de test pour l'inférence JS
  test-fr-numbers.mjs      tests du parseur de nombres
  test-digits.mjs          l'inférence JS == le modèle Python
```

### Tests

```bash
node tools/test-fr-numbers.mjs   # 118 cas de reconnaissance de nombres
node tools/test-digits.mjs       # l'inférence JS reproduit le modèle Python
```

Le premier couvre les 100 nombres écrits en lettres, les phrases avec
hésitation, les variantes belges/suisses et les homophones fréquents. Le second
rejoue 20 chiffres MNIST à travers `js/digits.js` et compare aux probabilités
calculées côté Python : une transposition de poids donnerait des résultats
plausibles mais faux, et serait attrapée ici.

---

## Choix techniques

**Pourquoi du PHP alors que le reste est front-only ?** Uniquement pour Whisper.
En pur JavaScript, la clé OpenAI serait lisible dans le code de la page par
n'importe quel visiteur, qui pourrait s'en servir à tes frais.
`api/transcribe.php` est le plus petit serveur possible : il reçoit l'audio,
ajoute la clé, relaie, renvoie le texte. Les trois autres moteurs vocaux ne
passent pas par lui du tout.

**Pourquoi ne pas entraîner notre propre modèle vocal, comme pour les chiffres ?**
Parce que le blocage n'est pas le code, c'est **les données**. MNIST fournit
60 000 chiffres étiquetés gratuits en un téléchargement ; il n'existe pas
d'équivalent pour « des nombres français prononcés par des enfants ». Les corpus
disponibles sont de la parole adulte en phrases, et un modèle entraîné là-dessus
s'écroule sur une voix de cinq ans — pitch et formants n'ont rien à voir. En
prime, un nombre est une *séquence* de mots (« soixante-douze »), donc il
faudrait un modèle CTC, pas le petit classifieur qui suffit pour un chiffre
isolé. D'où le choix de s'appuyer sur la reconnaissance que le navigateur
fournit déjà.

**Afficher 100 nombres.** Les tailles sont en unités `cqw` (relatives à la
largeur du plateau) : les 100 cases restent lisibles d'un téléphone de 360 px à
un grand écran, sans media query et sans zoom. Une colonne sur deux est
légèrement teintée pour aider à repérer les unités, et en mode voix la case
active défile automatiquement à l'écran. Le mode « construire » ne montre
**qu'un nombre à la fois** — pas 100 pastilles à faire glisser, ce qui serait
inutilisable au doigt.

**Pas de drag & drop.** On tire un nombre, l'enfant touche une case. Une seule
cible par geste, ça marche aussi bien à la souris qu'au doigt. Les cadres
d'écriture sont en `touch-action: none`, sinon le doigt ferait défiler la page
au lieu d'écrire.

**Une règle CSS qui compte.** `[hidden] { display: none !important }` en tête de
feuille : nos règles `display: grid` / `inline-flex` battent sinon la feuille du
navigateur, et un élément marqué `hidden` resterait affiché.

**Accessibilité.** Navigation au clavier, `aria-label` sur chaque case,
`prefers-reduced-motion` respecté, cibles tactiles ≥ 38 px, contrastes soutenus.
