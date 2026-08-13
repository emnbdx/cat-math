#!/usr/bin/env node
/**
 * Génère data/cats.json : le catalogue des 100 chats.
 *
 * C'est la source de vérité unique, utilisée à la fois par :
 *  - generate-avatar / tools/generate-cats.mjs (prompts d'images)
 *  - le front (pour les noms et les chats SVG de repli)
 *
 * Les attributs sont combinés de façon déterministe pour garantir que
 * les 100 chats sont uniques (fourrure × expression fait exactement 100
 * paires distinctes : ppcm(20, 25) = 100).
 *
 * Usage : node tools/build-catalog.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 20 fourrures / robes. */
const FURS = [
  { fr: 'tigré roux', en: 'orange tabby fur with soft stripes', pattern: 'tabby' },
  { fr: 'tigré gris', en: 'grey tabby fur with soft stripes', pattern: 'tabby' },
  { fr: 'blanc neige', en: 'snow white fluffy fur', pattern: 'plain' },
  { fr: 'noir de jais', en: 'jet black fur', pattern: 'plain' },
  { fr: 'bicolore noir et blanc', en: 'black and white bicolour fur', pattern: 'bicolour' },
  { fr: 'calico tricolore', en: 'tricolour calico fur', pattern: 'patch' },
  { fr: 'siamois crème', en: 'cream siamese fur with darker face points', pattern: 'points' },
  { fr: 'bleu russe', en: 'blue-grey russian fur', pattern: 'plain' },
  { fr: 'roux et blanc', en: 'ginger and white fur', pattern: 'bicolour' },
  { fr: 'tacheté bengal', en: 'spotted bengal fur', pattern: 'spots' },
  { fr: 'angora à longs poils', en: 'long haired fluffy white fur', pattern: 'plain' },
  { fr: 'chartreux gris', en: 'plush grey chartreux fur', pattern: 'plain' },
  { fr: 'écaille de tortue', en: 'tortoiseshell fur', pattern: 'patch' },
  { fr: 'smoking noir à plastron blanc', en: 'black fur with a white chest bib', pattern: 'bicolour' },
  { fr: 'sable clair', en: 'light sandy beige fur', pattern: 'plain' },
  { fr: 'gris argenté rayé', en: 'silver striped fur', pattern: 'tabby' },
  { fr: 'brun chocolat', en: 'chocolate brown fur', pattern: 'plain' },
  { fr: 'blanc à taches rousses', en: 'white fur with ginger patches', pattern: 'patch' },
  { fr: 'gris moucheté', en: 'grey speckled fur', pattern: 'spots' },
  { fr: 'noir à chaussettes blanches', en: 'black fur with white socks', pattern: 'bicolour' },
];

/** 25 expressions. `eyes` et `mouth` pilotent le chat SVG de repli. */
const EXPRESSIONS = [
  { fr: 'tout joyeux', en: 'beaming happy smile, eyes closed in joy', eyes: 1, mouth: 0 },
  { fr: 'surpris', en: 'wide surprised eyes, small open mouth', eyes: 0, mouth: 3 },
  { fr: 'endormi', en: 'sleepy half closed eyes, tiny yawn', eyes: 2, mouth: 4 },
  { fr: 'câlin', en: 'soft loving look, cheeks squished', eyes: 0, mouth: 1 },
  { fr: 'rieur', en: 'laughing out loud, mouth wide open', eyes: 1, mouth: 3 },
  { fr: 'timide', en: 'shy bashful look, looking away', eyes: 5, mouth: 1 },
  { fr: 'curieux', en: 'curious tilted head, one ear up', eyes: 0, mouth: 2 },
  { fr: 'fier', en: 'proud confident smile, chin up', eyes: 3, mouth: 0 },
  { fr: 'malicieux', en: 'mischievous grin, narrowed eyes', eyes: 3, mouth: 0 },
  { fr: 'tout ému', en: 'teary eyed with emotion, happy tears', eyes: 6, mouth: 1 },
  { fr: 'affamé', en: 'hungry excited eyes, licking lips', eyes: 0, mouth: 5 },
  { fr: 'rêveur', en: 'dreamy faraway gaze, tiny smile', eyes: 5, mouth: 1 },
  { fr: 'concentré', en: 'focused determined frown, tongue out', eyes: 3, mouth: 5 },
  { fr: 'espiègle', en: 'playful wink and cheeky smile', eyes: 4, mouth: 0 },
  { fr: 'tendre', en: 'gentle tender smile, soft eyes', eyes: 0, mouth: 1 },
  { fr: 'étonné', en: 'astonished round mouth, raised brows', eyes: 0, mouth: 3 },
  { fr: 'complice', en: 'winking with a knowing smile', eyes: 4, mouth: 0 },
  { fr: 'boudeur', en: 'cutely sulking, puffed cheeks', eyes: 2, mouth: 6 },
  { fr: 'tout excité', en: 'super excited sparkling eyes', eyes: 7, mouth: 3 },
  { fr: 'zen', en: 'peaceful serene closed eyes, calm smile', eyes: 1, mouth: 1 },
  { fr: 'amoureux', en: 'heart shaped eyes, blissful smile', eyes: 8, mouth: 0 },
  { fr: 'pensif', en: 'thoughtful look, paw on chin', eyes: 5, mouth: 2 },
  { fr: 'en train de chanter', en: 'singing with eyes shut and mouth open', eyes: 1, mouth: 3 },
  { fr: 'ébahi', en: 'amazed starry wide eyes', eyes: 7, mouth: 3 },
  { fr: 'satisfait', en: 'smug satisfied little smile', eyes: 3, mouth: 1 },
];

/** 20 accessoires. */
const ACCESSORIES = [
  { fr: 'un nœud papillon pastel', en: 'a small pastel bow tie' },
  { fr: 'une fleur derrière l’oreille', en: 'a flower tucked behind one ear' },
  { fr: 'un minuscule chapeau melon', en: 'a tiny bowler hat' },
  { fr: 'une écharpe rayée', en: 'a striped knitted scarf' },
  { fr: 'un collier à grelot', en: 'a collar with a little bell' },
  { fr: 'une couronne en papier', en: 'a paper crown' },
  { fr: 'des lunettes rondes', en: 'round eyeglasses' },
  { fr: 'un bonnet à pompon', en: 'a bobble hat' },
  { fr: 'un bandana à pois', en: 'a polka dot bandana' },
  { fr: 'un casque d’aviateur', en: 'a leather aviator cap with goggles' },
  { fr: 'un béret', en: 'a little beret' },
  { fr: 'un casque de musique', en: 'oversized headphones' },
  { fr: 'un pull tricoté', en: 'a cosy knitted sweater' },
  { fr: 'une cape étoilée', en: 'a tiny cape covered in stars' },
  { fr: 'un chapeau de paille', en: 'a straw sun hat' },
  { fr: 'un serre-tête à oreilles de lapin', en: 'a bunny ear headband' },
  { fr: 'un bavoir en forme de nuage', en: 'a cloud shaped bib' },
  { fr: 'un ruban au bout de la queue', en: 'a ribbon tied on the tail' },
  { fr: 'un tout petit sac à dos', en: 'a very small backpack' },
  { fr: 'rien du tout', en: 'no accessory at all' },
];

/** 10 palettes pastel (fourrure / accent / joues) pour les chats SVG de repli. */
const PALETTES = [
  { name: 'pêche', fur: '#ffd3b6', accent: '#ff9a76', blush: '#ff8fa3' },
  { name: 'lavande', fur: '#dcd3f7', accent: '#a78bfa', blush: '#f7a8c4' },
  { name: 'menthe', fur: '#c8f0dc', accent: '#5ec5a0', blush: '#f9a1b5' },
  { name: 'ciel', fur: '#cfe6ff', accent: '#6fa8dc', blush: '#ffa0b4' },
  { name: 'citron', fur: '#fdf0b2', accent: '#e8c14b', blush: '#ff96ad' },
  { name: 'rose', fur: '#ffd6e4', accent: '#f77fa1', blush: '#ff7d9c' },
  { name: 'sable', fur: '#f2e3c9', accent: '#c9a878', blush: '#f79bb0' },
  { name: 'ardoise', fur: '#d8dee6', accent: '#7d8a99', blush: '#f79bb0' },
  { name: 'cacao', fur: '#e4c9b0', accent: '#a67c52', blush: '#f2909f' },
  { name: 'corail', fur: '#ffcfc4', accent: '#f76c5e', blush: '#ff7a92' },
];

/** 100 prénoms de chats. */
const NAMES = [
  'Mochi', 'Praline', 'Nougat', 'Caramel', 'Biscuit', 'Muffin', 'Pistache', 'Noisette', 'Myrtille', 'Framboise',
  'Cannelle', 'Vanille', 'Chocolat', 'Guimauve', 'Croissant', 'Baguette', 'Macaron', 'Éclair', 'Brioche', 'Madeleine',
  'Pépite', 'Pompon', 'Bouclette', 'Moustache', 'Chaussette', 'Réglisse', 'Nuage', 'Comète', 'Étoile', 'Lune',
  'Soleil', 'Orage', 'Brume', 'Flocon', 'Bourrasque', 'Tempête', 'Zéphyr', 'Ondée', 'Rosée', 'Aurore',
  'Filou', 'Coquin', 'Malice', 'Fripon', 'Espiègle', 'Câlin', 'Doudou', 'Bisou', 'Ronron', 'Patapouf',
  'Sushi', 'Wasabi', 'Yuzu', 'Matcha', 'Sakura', 'Ramen', 'Onigiri', 'Dango', 'Konpeito', 'Taiyaki',
  'Kiwi', 'Papaye', 'Mangue', 'Litchi', 'Groseille', 'Mirabelle', 'Clémentine', 'Abricot', 'Prunelle', 'Cassis',
  'Saphir', 'Topaze', 'Opale', 'Ambre', 'Jade', 'Onyx', 'Perle', 'Corail', 'Turquoise', 'Améthyste',
  'Pixel', 'Confetti', 'Origami', 'Domino', 'Kaléido', 'Ricochet', 'Tourbillon', 'Colimaçon', 'Bagatelle', 'Farandole',
  'Plumeau', 'Grelot', 'Bobine', 'Pelote', 'Chamallow', 'Berlingot', 'Sucrette', 'Nectar', 'Sorbet', 'Panettone',
];

/** Poses, pour varier un peu plus les images. */
const POSES = [
  'sitting facing the viewer',
  'standing on all fours, seen from the front',
  'sitting with the tail curled around the paws',
  'lying down with paws tucked under',
  'sitting with one paw raised in a wave',
  'peeking with both front paws forward',
];

const STYLE =
  'kawaii chibi cat sticker illustration, cute rounded shapes, oversized head, ' +
  'thick soft outline, flat pastel colours with simple soft shading, ' +
  'big glossy eyes, tiny nose, centred single character, full body visible, ' +
  'solid flat pure magenta (#FF00FF) chroma-key background, no checkerboard, ' +
  'no shadows, no floor, no text, no watermark, no border, ' +
  'children book mascot style';

function buildPrompt({ fur, expression, accessory, pose }) {
  return (
    `A single ${STYLE}. ` +
    `The cat has ${fur.en}. ` +
    `Its face shows: ${expression.en}. ` +
    `It is ${pose}. ` +
    `It wears ${accessory.en}.`
  );
}

const cats = Array.from({ length: 100 }, (_, i) => {
  const id = i + 1;
  const fur = FURS[i % FURS.length];
  const expression = EXPRESSIONS[i % EXPRESSIONS.length];
  const accessory = ACCESSORIES[(i * 3) % ACCESSORIES.length];
  const palette = PALETTES[(i * 7) % PALETTES.length];
  const pose = POSES[(i * 5) % POSES.length];

  return {
    id,
    name: NAMES[i],
    file: `cat-${String(id).padStart(3, '0')}.png`,
    fur: fur.fr,
    expression: expression.fr,
    accessory: accessory.fr,
    // Paramètres du chat SVG de repli (affiché tant que l'image n'existe pas).
    svg: {
      palette,
      pattern: fur.pattern,
      eyes: expression.eyes,
      mouth: expression.mouth,
    },
    prompt: buildPrompt({ fur, expression, accessory, pose }),
  };
});

// Garde-fou : les 100 combinaisons fourrure + expression doivent être uniques.
const combos = new Set(cats.map((c) => `${c.fur}|${c.expression}`));
if (combos.size !== cats.length) {
  throw new Error(`Combinaisons non uniques : ${combos.size}/${cats.length}`);
}

await mkdir(join(ROOT, 'data'), { recursive: true });
await writeFile(
  join(ROOT, 'data', 'cats.json'),
  JSON.stringify({ version: 1, count: cats.length, cats }, null, 2) + '\n',
  'utf8',
);

console.log(`✅ data/cats.json — ${cats.length} chats uniques`);
