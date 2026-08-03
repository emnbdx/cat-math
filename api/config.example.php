<?php
/**
 * Copie ce fichier en api/config.php et renseigne ta clé.
 * api/config.php est ignoré par git et bloqué par .htaccess.
 */

return [
    // Clé secrète OpenAI (https://platform.openai.com/api-keys)
    'api_key' => 'sk-remplace-moi',

    // Modèle de transcription. 'whisper-1' est le plus économique ;
    // 'gpt-4o-mini-transcribe' est un peu plus précis.
    'model' => 'whisper-1',

    // Langue attendue (code ISO-639-1). Améliore nettement la précision.
    'language' => 'fr',
];
