/**
 * Couche vocale : enregistrement micro → api/transcribe.php → Whisper.
 *
 * `listen()` renvoie { text, alternatives } — js/fr-numbers.js analyse la
 * transcription. Si Whisper n'est pas prêt, le mode voix ne démarre pas.
 */

import { startRecording, transcribe, probeServer, isSupported } from './audio.js';

const RECORD_MS = 5000;

/**
 * État du relais Whisper.
 * @returns {Promise<'ready'|'no_key'|'absent'|'error'|'unsupported'>}
 */
export async function whisperStatus() {
  if (!isSupported()) return 'unsupported';
  return probeServer();
}

/**
 * Lance une écoute Whisper.
 *
 * @param {object} opts
 * @param {(phase: string) => void} [opts.onPhase]  'listening' | 'transcribing'
 * @returns {Promise<{stop: () => void, done: Promise<{text: string, alternatives: string[]}>}>}
 */
export async function listen({ onPhase } = {}) {
  let recorder = null;
  let stopped = false;

  const done = (async () => {
    onPhase?.('listening');
    recorder = await startRecording({ maxMs: RECORD_MS });
    if (stopped) recorder.stop();
    const blob = await recorder.done;
    onPhase?.('transcribing');
    const text = await transcribe(blob);
    return { text, alternatives: text ? [text] : [] };
  })();

  return {
    stop() {
      stopped = true;
      recorder?.stop();
    },
    done,
  };
}
