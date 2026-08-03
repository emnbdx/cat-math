# 🐱 Les 100 chats

Jeu éducatif d'inspiration Montessori autour du **tableau du cent** (table de
Seguin / table de 100). Deux modes, et à chaque bonne réponse un chat kawaii
rejoint la collection. À chaque erreur, un chat s'en va.

Site **statique** (HTML/CSS/JS sans build) + **un seul fichier PHP** pour la
reconnaissance vocale. Se dépose tel quel sur un mutualisé OVH.

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

### 🎤 Dis le nombre

Le plateau est complet. Une case s'allume en jaune, l'enfant lit le nombre à
voix haute. L'audio part vers **Whisper** (OpenAI) et la transcription est
comparée au nombre attendu.

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

### 📚 La collection

Un album de 100 emplacements **par mode**, avec le nom de chaque chat. Les cases
non gagnées restent numérotées et grisées. La progression est enregistrée dans
le navigateur (`localStorage`) : on peut fermer l'onglet et reprendre plus tard.

---

## Installation sur un mutualisé OVH

1. Envoyer tout le dossier dans `www/` (ou un sous-dossier — les chemins sont
   relatifs, ça marche aussi dans `www/chats/`).
2. Pour le mode voix uniquement, créer `api/config.php` :

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

Le mode « Construire la table » et la collection fonctionnent **sans PHP et sans
clé API** : un simple hébergement statique suffit si le mode voix ne t'intéresse
pas.

### Test en local

```bash
php -S localhost:8000
# puis http://localhost:8000
```

`localhost` est considéré comme sécurisé par les navigateurs : le micro
fonctionne aussi en local.

---

## Générer les 100 chats

Sans images, le jeu affiche des **chats SVG dessinés à la volée** (9 regards,
7 bouches, 6 robes, 10 palettes) — il est donc jouable immédiatement. Les PNG
générés les remplacent dès qu'ils sont présents.

```bash
export OPENAI_API_KEY=sk-...            # ou créer tools/.env
node tools/generate-cats.mjs            # les 100 chats, ~3 en parallèle
```

Les images arrivent dans `assets/cats/cat-001.png` … `cat-100.png`, plus un
`manifest.json` que le front lit pour savoir lesquelles existent.

Options utiles :

```bash
node tools/generate-cats.mjs --dry-run              # affiche les prompts, n'appelle rien
node tools/generate-cats.mjs --count=5              # tester sur 5 chats d'abord
node tools/generate-cats.mjs --only=7,42,88         # régénérer ceux qui ne plaisent pas
node tools/generate-cats.mjs --model=gpt-image-1    # si gpt-image-2 n'est pas dispo sur le compte
node tools/generate-cats.mjs --quality=high         # plus beau, plus cher
node tools/generate-cats.mjs --resize=512           # allège les PNG (npm i sharp)
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
- **la transcription** : `whisper-1` est facturé à la minute d'audio. Chaque
  réponse d'enfant fait ~2 secondes, donc une partie complète de 100 nombres
  représente quelques minutes d'audio au total.

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
  audio.js                 MediaRecorder + envoi au serveur
  sfx.js                   sons (Web Audio, aucun fichier)
  ui.js                    récompenses, particules, fiche d'un chat
api/
  transcribe.php           relais vers Whisper (garde la clé côté serveur)
  config.example.php       à copier en config.php
data/cats.json             les 100 chats (généré, versionné)
assets/cats/               les PNG générés (non versionnés)
tools/
  build-catalog.mjs        régénère data/cats.json
  generate-cats.mjs        génère les 100 images
  test-fr-numbers.mjs      tests du parseur de nombres
```

### Tests

```bash
node tools/test-fr-numbers.mjs
```

118 cas : les 100 nombres écrits en lettres, les phrases avec hésitation, les
variantes belges/suisses, les homophones fréquents.

---

## Choix techniques

**Pourquoi du PHP alors que le reste est front-only ?** Le mode voix a besoin
d'une clé OpenAI. En pur JavaScript, la clé serait lisible dans le code de la
page par n'importe quel visiteur — n'importe qui pourrait s'en servir à tes
frais. `api/transcribe.php` est le plus petit serveur possible : il reçoit
l'audio, ajoute la clé, relaie, renvoie le texte. Rien d'autre du jeu n'est
côté serveur.

**Afficher 100 nombres.** Les tailles sont en unités `cqw` (relatives à la
largeur du plateau) : les 100 cases restent lisibles d'un téléphone de 360 px à
un grand écran, sans media query et sans zoom. Une colonne sur deux est
légèrement teintée pour aider à repérer les unités, et en mode voix la case
active défile automatiquement à l'écran. Le mode « construire » ne montre
**qu'un nombre à la fois** — pas 100 pastilles à faire glisser, ce qui serait
inutilisable au doigt.

**Pas de drag & drop.** On tire un nombre, l'enfant touche une case. Une seule
cible par geste, ça marche aussi bien à la souris qu'au doigt.

**Accessibilité.** Navigation au clavier, `aria-label` sur chaque case,
`prefers-reduced-motion` respecté, cibles tactiles ≥ 38 px, contrastes soutenus.
