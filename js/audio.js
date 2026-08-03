/**
 * Micro + transcription.
 *
 * L'audio est enregistré avec MediaRecorder puis envoyé à api/transcribe.php,
 * qui relaie vers Whisper. La clé OpenAI reste côté serveur : elle n'est jamais
 * exposée au navigateur.
 */

const API_URL = new URL('../api/transcribe.php', import.meta.url);

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',        // Safari / iOS
  'audio/ogg;codecs=opus',
];

const EXTENSIONS = {
  webm: 'webm',
  ogg: 'ogg',
  mp4: 'mp4',
  'x-m4a': 'm4a',
  mpeg: 'mp3',
  wav: 'wav',
  'x-wav': 'wav',
};

let stream = null;

export function isSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

/** Demande (une seule fois) l'accès au micro et garde le flux ouvert. */
export async function getStream() {
  if (stream?.active) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return stream;
}

/** Libère le micro (voyant du navigateur éteint) quand on quitte le mode. */
export function releaseStream() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function pickMime() {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}

/**
 * Démarre un enregistrement.
 * @returns {Promise<{stop: () => void, done: Promise<Blob>}>}
 */
export async function startRecording({ maxMs = 5000 } = {}) {
  const src = await getStream();
  const mimeType = pickMime();
  const rec = new MediaRecorder(src, mimeType ? { mimeType } : undefined);
  const chunks = [];

  rec.addEventListener('dataavailable', (e) => {
    if (e.data.size) chunks.push(e.data);
  });

  const done = new Promise((resolve) => {
    rec.addEventListener('stop', () => {
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
    }, { once: true });
  });

  rec.start();
  const timer = setTimeout(() => {
    if (rec.state !== 'inactive') rec.stop();
  }, maxMs);

  return {
    stop() {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
    },
    done,
  };
}

/** Envoie l'audio au serveur et renvoie la transcription. */
export async function transcribe(blob) {
  const subtype = (blob.type.split('/')[1] ?? 'webm').split(';')[0];
  const ext = EXTENSIONS[subtype] ?? 'webm';

  const form = new FormData();
  form.append('audio', blob, `voix.${ext}`);

  const res = await fetch(API_URL, { method: 'POST', body: form });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(payload.error || `Erreur serveur (${res.status})`);
    err.code = payload.code ?? 'http_error';
    err.status = res.status;
    throw err;
  }
  return String(payload.text ?? '').trim();
}
