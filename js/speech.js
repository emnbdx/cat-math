/**
 * Couche vocale unifiée : quatre moteurs derrière une seule interface.
 *
 *   local     Web Speech avec `processLocally` — Chrome télécharge et gère un
 *             modèle français sur l'appareil. Gratuit, et la voix ne sort pas
 *             du téléphone. C'est le défaut.
 *   browser   Web Speech classique — gratuit aussi, mais l'audio passe par les
 *             serveurs de Google (Chrome) ou d'Apple (Safari).
 *   whisper   Notre api/transcribe.php → Whisper. Payant et nécessite une clé,
 *             mais marche partout, Firefox compris, et comprend mieux les voix
 *             d'enfants.
 *   keyboard  Pas de micro du tout : l'enfant tape le nombre.
 *
 * `listen()` renvoie toujours la même chose — { text, alternatives, engine } —
 * donc js/fr-numbers.js analyse la transcription sans savoir d'où elle vient.
 */

import { startRecording, transcribe, probeServer } from './audio.js';

const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const LANG = 'fr-FR';
const WEB_SPEECH_TIMEOUT = 9000;   // filet : certains navigateurs n'émettent jamais `end`
const RECORD_MS = 5000;

export const ENGINES = ['local', 'browser', 'whisper', 'keyboard'];

export const ENGINE_LABELS = {
  local: 'modèle local (sur l’appareil)',
  browser: 'reconnaissance du navigateur',
  whisper: 'Whisper (OpenAI)',
  keyboard: 'clavier',
};

/* ============================================================
   Détection des capacités
   ============================================================ */

export function hasWebSpeech() {
  return Boolean(SR);
}

/** Le navigateur sait-il forcer le traitement sur l'appareil ? */
export function supportsLocal() {
  return Boolean(SR && 'processLocally' in SR.prototype);
}

/**
 * État du modèle local.
 * @returns {Promise<'available'|'downloadable'|'downloading'|'unavailable'|'unsupported'>}
 */
export async function localStatus() {
  if (!supportsLocal() || typeof SR.available !== 'function') return 'unsupported';
  try {
    const status = await SR.available({ langs: [LANG], processLocally: true });
    if (typeof status === 'string') return status;
    return status ? 'available' : 'unavailable';
  } catch {
    return 'unsupported';
  }
}

/** Demande à Chrome de télécharger le modèle français. À appeler sur un clic. */
export async function installLocal() {
  if (typeof SR?.install !== 'function') {
    throw new Error('Ce navigateur ne gère pas les modèles locaux.');
  }
  return SR.install({ langs: [LANG], processLocally: true });
}

/**
 * Capacités réelles des quatre moteurs, pour l'écran de réglages.
 * @returns {Promise<Record<string, {usable: boolean, state: string}>>}
 */
export async function capabilities() {
  const [local, whisper] = await Promise.all([localStatus(), probeServer()]);
  return {
    local: {
      usable: local === 'available',
      state: local,           // available | downloadable | downloading | unavailable | unsupported
    },
    browser: {
      usable: hasWebSpeech(),
      state: hasWebSpeech() ? 'available' : 'unsupported',
    },
    whisper: {
      usable: whisper === 'ready',
      state: whisper,         // ready | no_key | absent | error
    },
    keyboard: { usable: true, state: 'available' },
  };
}

/**
 * Moteur réellement utilisable, en partant du choix de l'utilisateur.
 * On descend la liste dans l'ordre : local → navigateur → Whisper → clavier.
 *
 * @param {string} preferred    moteur choisi dans les réglages
 * @param {object} caps         résultat de capabilities()
 * @param {Set<string>} broken  moteurs qui ont échoué pendant la session
 */
export function resolveEngine(preferred, caps, broken = new Set()) {
  const order = [preferred, ...ENGINES.filter((e) => e !== preferred)];
  for (const engine of order) {
    if (!broken.has(engine) && caps[engine]?.usable) return engine;
  }
  return 'keyboard';
}

/* ============================================================
   Écoute
   ============================================================ */

/**
 * Lance une écoute.
 *
 * @param {object} opts
 * @param {string} opts.engine       'local' | 'browser' | 'whisper'
 * @param {(text: string) => void} [opts.onPartial]  transcription en cours
 * @param {(phase: string) => void} [opts.onPhase]   'listening' | 'transcribing'
 * @returns {Promise<{stop: () => void, done: Promise<{text: string, alternatives: string[], engine: string}>}>}
 */
export async function listen({ engine, onPartial, onPhase }) {
  if (engine === 'whisper') return listenWhisper({ onPhase });
  return listenWebSpeech({ local: engine === 'local', onPartial, onPhase });
}

/** Erreurs qui condamnent le moteur pour la session (≠ « je n'ai rien entendu »). */
const ENGINE_FAILURES = new Set([
  'language-not-supported',
  'service-not-allowed',
  'audio-capture',
  'network',
  'bad-grammar',
]);

function listenWebSpeech({ local, onPartial, onPhase }) {
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
  if (local && 'processLocally' in recognition) recognition.processLocally = true;

  const alternatives = [];
  let settled = false;
  let watchdog = null;

  const done = new Promise((resolve, reject) => {
    const engine = local ? 'local' : 'browser';

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({ text: alternatives[0] ?? '', alternatives, engine });
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
