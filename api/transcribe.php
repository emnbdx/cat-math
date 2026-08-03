<?php
/**
 * Relais vers l'API de transcription d'OpenAI (Whisper).
 *
 * Reçoit un fichier audio (champ `audio`) du navigateur, l'envoie à OpenAI et
 * renvoie { "text": "soixante-douze" }. La clé API reste ici, côté serveur.
 *
 * Réponses d'erreur : { "error": "message lisible", "code": "identifiant" }
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MAX_BYTES = 8 * 1024 * 1024;          // 8 Mo : ~5 s d'audio, large
const ALLOWED_EXT = ['webm', 'ogg', 'oga', 'mp3', 'mp4', 'm4a', 'wav', 'mpga', 'mpeg', 'flac'];
const RATE_LIMIT = 90;                       // requêtes…
const RATE_WINDOW = 300;                     // …par IP et par 5 minutes
                                             // (~18/min : large pour un enfant, borné en cas de fuite d'URL)

/** Termine la requête sur une erreur. */
function fail(int $status, string $message, string $code): never
{
    http_response_code($status);
    echo json_encode(['error' => $message, 'code' => $code], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ------------------------------------------------------------ méthode --- */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    fail(405, 'Méthode non autorisée.', 'method_not_allowed');
}

/* --------------------------------------------------- configuration ------ */

$config = ['api_key' => '', 'model' => 'whisper-1', 'language' => 'fr'];

$configFile = __DIR__ . '/config.php';
if (is_file($configFile)) {
    $loaded = require $configFile;
    if (is_array($loaded)) {
        $config = array_merge($config, $loaded);
    }
}

// Une variable d'environnement (SetEnv dans .htaccess, ou panneau OVH) gagne.
foreach (['OPENAI_API_KEY' => 'api_key', 'OPENAI_TRANSCRIBE_MODEL' => 'model'] as $env => $key) {
    $value = getenv($env) ?: ($_SERVER[$env] ?? '');
    if (is_string($value) && $value !== '') {
        $config[$key] = trim($value);
    }
}

if ($config['api_key'] === '') {
    fail(
        503,
        'Clé OpenAI absente : copie api/config.example.php en api/config.php et ajoute ta clé.',
        'no_api_key'
    );
}

/* ------------------------------------------------------ limite de débit -- */

if (!rate_limit_ok()) {
    fail(429, 'Trop de requêtes, patiente quelques secondes.', 'rate_limited');
}

/**
 * Petit garde-fou anti-abus (fenêtre glissante, un fichier par IP).
 * Sans état partagé sur un mutu, c'est suffisant pour éviter de faire
 * flamber la facture si l'URL fuite.
 */
function rate_limit_ok(): bool
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'inconnue');
    $path = sys_get_temp_dir() . '/cent-chats-rl-' . sha1($ip) . '.json';

    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        return true; // pas de /tmp accessible : on n'empêche pas de jouer
    }

    $ok = true;
    if (flock($handle, LOCK_EX)) {
        $now = time();
        $raw = (string) stream_get_contents($handle);
        $hits = array_values(array_filter(
            is_array($decoded = json_decode($raw, true)) ? $decoded : [],
            static fn ($t): bool => is_int($t) && $t > $now - RATE_WINDOW
        ));

        if (count($hits) >= RATE_LIMIT) {
            $ok = false;
        } else {
            $hits[] = $now;
        }

        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, json_encode($hits));
        fflush($handle);
        flock($handle, LOCK_UN);
    }
    fclose($handle);

    return $ok;
}

/* --------------------------------------------------------- fichier reçu -- */

$upload = $_FILES['audio'] ?? null;

if (!is_array($upload) || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $code = is_array($upload) ? (int) ($upload['error'] ?? -1) : -1;
    $message = match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Enregistrement trop lourd.',
        UPLOAD_ERR_NO_FILE => 'Aucun audio reçu.',
        default => 'Envoi de l’audio échoué.',
    };
    fail(400, $message, 'bad_upload');
}

if (!is_uploaded_file($upload['tmp_name'])) {
    fail(400, 'Fichier invalide.', 'bad_upload');
}

$size = (int) $upload['size'];
if ($size <= 0) {
    fail(400, 'Enregistrement vide.', 'empty_audio');
}
if ($size > MAX_BYTES) {
    fail(413, 'Enregistrement trop long.', 'too_large');
}

$ext = strtolower(pathinfo((string) ($upload['name'] ?? ''), PATHINFO_EXTENSION));
if (!in_array($ext, ALLOWED_EXT, true)) {
    fail(415, 'Format audio non pris en charge.', 'bad_format');
}

/* ----------------------------------------------------------- appel API --- */

if (!function_exists('curl_init')) {
    fail(500, 'L’extension cURL de PHP est requise.', 'no_curl');
}

$mime = (string) ($upload['type'] ?? '');
if ($mime === '' || (!str_starts_with($mime, 'audio/') && !str_starts_with($mime, 'video/'))) {
    $mime = 'application/octet-stream';
}

$post = [
    'file' => new CURLFile($upload['tmp_name'], $mime, 'voix.' . $ext),
    'model' => $config['model'],
    'language' => $config['language'],
    'temperature' => '0',
    // Oriente le modèle : on attend un nombre entre 1 et 100, en français.
    'prompt' => 'Un enfant dit un nombre entre un et cent en français. Par exemple : sept, vingt-trois, soixante-douze, quatre-vingt-quinze, cent.',
];

$curl = curl_init('https://api.openai.com/v1/audio/transcriptions');
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $post,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $config['api_key']],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_CONNECTTIMEOUT => 10,
]);

$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($curl);
curl_close($curl);

if ($body === false) {
    error_log('[cent-chats] cURL: ' . $curlError);
    fail(502, 'Le serveur n’a pas pu joindre OpenAI.', 'upstream_unreachable');
}

$json = json_decode((string) $body, true);

if ($status !== 200) {
    // On journalise le détail, on ne le renvoie pas : il peut être bavard.
    error_log('[cent-chats] OpenAI HTTP ' . $status . ' : ' . substr((string) $body, 0, 500));
    fail(
        $status === 429 ? 429 : 502,
        $status === 429 ? 'OpenAI est saturé, réessaie dans un instant.' : 'La reconnaissance a échoué.',
        $status === 429 ? 'rate_limited' : 'upstream_error'
    );
}

if (!is_array($json) || !isset($json['text'])) {
    fail(502, 'Réponse inattendue d’OpenAI.', 'bad_upstream_response');
}

echo json_encode(['text' => (string) $json['text']], JSON_UNESCAPED_UNICODE);
