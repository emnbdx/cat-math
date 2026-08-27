/**
 * La rencontre avec un chat sauvage : petite scène, menu d'actions, et une
 * question de nombres pour réussir la capture.
 */

import { catSvg } from '../cats.js';
import { say, choose } from './dialog.js';
import { makeQuestion } from './quiz.js';
import { sheet, flavour } from './catinfo.js';
import { addCat, markSeen, save } from './save.js';
import * as audio from './audio.js';

const screenEl = document.getElementById('screen');
const scene = document.getElementById('encounter');
const artEl = document.getElementById('encounter-art');
const nameEl = document.getElementById('encounter-name');
const subEl = document.getElementById('encounter-sub');
const card = document.getElementById('catcard');
const cardBody = document.getElementById('catcard-body');

const MAX_TRIES = 3;

/**
 * Déroule la rencontre. Renvoie 'caught', 'fled' (le chat est parti) ou
 * 'ran' (le joueur s'en va).
 */
export async function encounter(cat) {
  markSeen(cat.id);
  audio.encounter();

  artEl.innerHTML = catSvg(cat);
  nameEl.textContent = cat.name;
  subEl.textContent = `Chat sauvage · ${sheet(cat).number}`;
  scene.hidden = false;
  screenEl.classList.add('is-scene');
  scene.classList.add('is-entering');
  setTimeout(() => scene.classList.remove('is-entering'), 500);

  await say([`Un chat sauvage apparaît !`, `C’est ${cat.name} ! ${flavour(cat)}`]);

  let tries = MAX_TRIES;
  let easy = false;
  let petted = false;

  while (tries > 0) {
    const action = await choose('Que fais-tu ?', ['🍥 Croquette', '🤚 Caresser', '👋 S’en aller']);

    if (action === 2) {
      await say([`Tu t’éloignes sur la pointe des pieds. ${cat.name} continue sa sieste.`]);
      return finish('ran');
    }

    if (action === 1) {
      if (petted) {
        await say([`${cat.name} ronronne déjà très fort. À toi de jouer !`]);
      } else {
        petted = true;
        easy = true;
        audio.blip();
        scene.classList.add('is-happy');
        setTimeout(() => scene.classList.remove('is-happy'), 600);
        await say([
          `Tu grattes ${cat.name} derrière l’oreille…`,
          `Il ronronne ! ${sheet(cat).likes.toLowerCase()}, visiblement.`,
          'Il te fait confiance : la question sera plus facile.',
        ]);
      }
      continue;
    }

    // croquette : il faut répondre juste pour l'attirer
    const { question, answer, options } = makeQuestion({ easy });
    await say(['Tu tends une croquette…', 'Le chat lève la tête et attend ta réponse.']);
    const chosen = await choose(question, options.map(String));

    if (options[chosen] === answer) {
      audio.caught();
      addCat(cat.id);
      await showCard(cat);
      return finish('caught');
    }

    tries--;
    audio.fail();
    scene.classList.add('is-shaking');
    setTimeout(() => scene.classList.remove('is-shaking'), 400);

    if (tries === 0) {
      await say([`Ce n’était pas ${options[chosen]}, mais ${answer}.`, `${cat.name} s’enfuit dans les herbes !`]);
      return finish('fled');
    }
    await say([
      `Ce n’était pas ${options[chosen]}…`,
      `${cat.name} recule un peu. Il te reste ${tries} essai${tries > 1 ? 's' : ''}.`,
    ]);
  }

  return finish('fled');
}

function finish(result) {
  scene.hidden = true;
  scene.classList.remove('is-caught');
  screenEl.classList.remove('is-scene');
  card.hidden = true;
  nameEl.parentElement.hidden = false;
  artEl.replaceChildren();
  return result;
}

/** La carte « Nouveau chat capturé ! ». */
async function showCard(cat) {
  const info = sheet(cat);
  cardBody.innerHTML = `
    <div class="catcard__art">${catSvg(cat)}</div>
    <div class="catcard__info">
      <p class="catcard__name">${cat.name} <span class="catcard__gender">${info.gender}</span></p>
      <p class="catcard__num">${info.number}</p>
      <p class="catcard__row">Type : <span class="tag">${info.type}</span></p>
      <p class="catcard__row">Talent : ${info.talent}</p>
      <p class="catcard__row">Aime : ${info.likes}</p>
    </div>`;
  card.hidden = false;
  // la fiche montre déjà le chat et son nom : on efface la scène derrière
  scene.classList.add('is-caught');
  nameEl.parentElement.hidden = true;
  await say([
    `${cat.name} a rejoint ta collection !`,
    `Tu as maintenant ${save.caught.length} chat${save.caught.length > 1 ? 's' : ''} sur 100.`,
    'Retrouve-le quand tu veux dans la boîte à chats.',
  ]);
  card.hidden = true;
  scene.classList.remove('is-caught');
  nameEl.parentElement.hidden = false;
}
