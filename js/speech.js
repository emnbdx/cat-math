/**
 * Couche vocale : deux moteurs derrière une seule interface.
 *
 *   browser   Reconnaissance intégrée au navigateur (Web Speech). Gratuite,
 *             sans clé, sans serveur. Chrome, Edge et Safari.
 *   whisper   Notre api/transcribe.php → Whisper. Payant et nécessite une clé,
 *             mais marche partout, Firefox compris, et comprend mieux les voix
 *             d'enfants.
 *
 * Le choix se fait dans les réglages. `listen()` renvoie toujours la même
 * chose — { text, alternatives, engine } — donc js/fr-numbers.js analyse la
 * transcription sans savoir d'où elle vient.
 *
 * Si aucun des deux n'est disponible, `resolveEngine()` renvoie null et le mode
 * voix bascule sur la saisie au clavier.
 */

import { startRecording, transcribe, probeServer } from './audio.js';

const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const LANG = 'fr-FR';
const WEB_SPEECH_TIMEOUT = 9000;   // filet : certains navigateurs n'émettent jamais `end`
const RECORD_MS = 5000;

export const ENGINES = ['browser', 'whisper'];

export const ENGINE_LABELS = {
  browser: 'reconnaissance du navigateur',
  whisper: 'Whisper (OpenAI)',
};

/* ============================================================
   Détection des capacités
   ============================================================ */

export function hasWebSpeech() {
  return Boolean(SR);
}

/**
 * Disponibilité réelle des deux moteurs, pour l'écran de réglages.
 * @returns {Promise<Record<string, {usable: boolean, state: string}>>}
 */
export async function capabilities() {
  const whisper = await probeServer();
  return {
    browser: {
      usable: hasWebSpeech(),
      state: hasWebSpeech() ? 'available' : 'unsupported',
    },
    whisper: {
      usable: whisper === 'ready',
      state: whisper,          // ready | no_key | absent | error
    },
  };
}

/**
 * Moteur réellement utilisable, en partant du choix de l'utilisateur.
 *
 * @param {string} preferred    moteur choisi dans les réglages
 * @param {object} caps         résultat de capabilities()
 * @param {Set<string>} broken  moteurs tombés en panne pendant la session
 * @returns {string|null}       null si aucun moteur vocal n'est disponible
 */
export function resolveEngine(preferred, caps, broken = new Set()) {
  const order = [preferred, ...ENGINES.filter((e) => e !== preferred)];
  for (const engine of order) {
    if (!broken.has(engine) && caps[engine]?.usable) return engine;
  }
  return null;
}

/* ============================================================
   Écoute
   ============================================================ */

/**
 * Lance une écoute.
 *
 * @param {object} opts
 * @param {string} opts.engine                       'browser' | 'whisper'
 * @param {(text: string) => void} [opts.onPartial]  transcription en cours
 * @param {(phase: string) => void} [opts.onPhase]   'listening' | 'transcribing'
 * @returns {Promise<{stop: () => void, done: Promise<{text: string, alternatives: string[], engine: string}>}>}
 */
export async function listen({ engine, onPartial, onPhase }) {
  if (engine === 'whisper') return listenWhisper({ onPhase });
  return listenWebSpeech({ onPartial, onPhase });
}

/** Erreurs qui condamnent le moteur pour la session (≠ « je n'ai rien entendu »). */
const ENGINE_FAILURES = new Set([
  'language-not-supported',
  'service-not-allowed',
  'audio-capture',
  'network',
  'bad-grammar',
]);

function listenWebSpeech({ onPartial, onPhase }) {
  if (!SR) {
    const err = new Error('Reconnaissance vocale non disponible dans ce navigateur.');
    err.engineFailure = true;
    throw err;
  }

  const recognition = new SR();
  recognition.lang = LANG;
  recognition.interimResults = true;
  recognition.continuous = false;
  // Plusieurs hypothèses : on validera si le bon nombre est dans n'importe
  // laquelle. Gratuit, et ça rattrape beaucoup d'approximations.
  recognition.maxAlternatives = 5;

  const alternatives = [];
  let settled = false;
  let watchdog = null;

  const done = new Promise((resolve, reject) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({ text: alternatives[0] ?? '', alternatives, engine: 'browser' });
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      reject(error);
    };

    recognition.onstart = () => onPhase?.('listening');

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a++) alternatives.push(result[a].transcript);
        } else {
          onPartial?.(result[0].transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      // « rien entendu » ou arrêt manuel : ce n'est pas une panne du moteur
      if (event.error === 'no-speech' || event.error === 'aborted') return finish();
      const err = new Error(describeWebSpeechError(event.error));
      err.code = event.error;
      err.engineFailure = ENGINE_FAILURES.has(event.error);
      fail(err);
    };

    recognition.onend = finish;

    watchdog = setTimeout(() => {
      try { recognition.abort(); } catch { /* déjà terminé */ }
      finish();
    }, WEB_SPEECH_TIMEOUT);

    try {
      recognition.start();
    } catch (err) {
      err.engineFailure = true;
      fail(err);
    }
  });

  return {
    stop() {
      try { recognition.stop(); } catch { /* déjà terminé */ }
    },
    done,
  };
}

function describeWebSpeechError(code) {
  switch (code) {
    case 'not-allowed':
      return 'Le micro est bloqué : autorise-le dans le navigateur.';
    case 'language-not-supported':
      return 'Le français n’est pas disponible pour ce moteur.';
    case 'service-not-allowed':
      return 'Le service de reconnaissance a refusé la demande.';
    case 'audio-capture':
      return 'Aucun micro détecté.';
    case 'network':
      return 'Ce moteur a besoin du réseau et il n’est pas joignable.';
    default:
      return `Reconnaissance impossible (${code}).`;
  }
}

function listenWhisper({ onPhase }) {
  let recorder = null;
  let stopped = false;

  const done = (async () => {
    onPhase?.('listening');
    recorder = await startRecording({ maxMs: RECORD_MS });
    if (stopped) recorder.stop();            // arrêt demandé avant que le micro soit prêt
    const blob = await recorder.done;
    onPhase?.('transcribing');
    const text = await transcribe(blob);
    return { text, alternatives: text ? [text] : [], engine: 'whisper' };
  })();

  return {
    stop() {
      stopped = true;
      recorder?.stop();
    },
    done,
  };
}
