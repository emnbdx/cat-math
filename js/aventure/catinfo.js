/**
 * La « fiche » d'un chat : numéro, genre, type, talent, ce qu'il aime.
 *
 * Tout est dérivé de `data/cats.json` de façon déterministe : un même chat
 * aura toujours la même fiche, sans rien stocker de plus.
 */

import { hash } from './pixel.js';

const TYPES = {
  tabby: 'TIGRÉ',
  spots: 'MOUCHETÉ',
  patch: 'BICOLORE',
  points: 'MASQUÉ',
  bicolour: 'PLASTRON',
  plain: 'NORMAL',
};

const TALENTS = [
  'Chance', 'Ronron', 'Gourmandise', 'Grand bond', 'Discrétion',
  'Curiosité', 'Câlin surprise', 'Équilibre', 'Pattes de velours',
];

const LIKES = [
  'Les compliments', 'Les cartons', 'Le soleil du matin', 'Les croquettes',
  'Les longues siestes', 'Les pelotes de laine', 'Les caresses sous le menton',
  'Les rideaux', 'Les sacs en papier', 'Regarder les oiseaux',
];

const pickFrom = (list, id, seed) => list[Math.floor(hash(id, seed, 3) * list.length)];

export function catNumber(id) {
  return `N°${String(id).padStart(3, '0')}`;
}

export function gender(id) {
  return hash(id, 11, 5) < 0.5 ? '♀' : '♂';
}

export function catType(cat) {
  return TYPES[cat.svg.pattern] ?? 'NORMAL';
}

export function talent(cat) {
  return pickFrom(TALENTS, cat.id, 21);
}

export function likes(cat) {
  return pickFrom(LIKES, cat.id, 33);
}

/** Petite phrase d'ambiance, affichée à la rencontre. */
export function flavour(cat) {
  return `Un chat ${cat.fur}, l’air ${cat.expression}. Il porte ${cat.accessory}.`;
}

/** Fiche complète, prête à être affichée. */
export function sheet(cat) {
  return {
    number: catNumber(cat.id),
    gender: gender(cat.id),
    type: catType(cat),
    talent: talent(cat),
    likes: likes(cat),
  };
}
