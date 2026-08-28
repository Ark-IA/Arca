-- ============================================================
-- Transcripción en el propio servidor
-- ============================================================
--
-- Hasta ahora la transcripción salía por una API de terceros con el
-- protocolo de OpenAI. Ahora corre `whisper.cpp` en el mismo servidor: el
-- audio de un cliente no sale de la máquina, y no hay costo por minuto.
--
-- Los dos protocolos se parecen pero no son iguales:
--
--   OpenAI       POST {base}/audio/transcriptions   campo `model` obligatorio
--   whisper.cpp  POST {base}/inference              sin `model` (ya cargado)
--
-- Se guarda CUÁL se habla en vez de deducirlo de la dirección. Adivinar por
-- la URL funcionaría hoy y se rompería el día que alguien ponga el servicio
-- local detrás de un nombre de dominio.

alter table ai_configs
  add column if not exists transcription_kind text not null default 'openai';

alter table ai_configs drop constraint if exists ai_configs_transcription_kind_check;
alter table ai_configs add constraint ai_configs_transcription_kind_check
  check (transcription_kind in ('openai', 'whispercpp'));

comment on column ai_configs.transcription_kind is
  'Protocolo del servicio que transcribe: openai (POST /audio/transcriptions, '
  'con clave) o whispercpp (POST /inference, sin clave, en el propio '
  'servidor).';

-- ------------------------------------------------------------
-- Se apunta al servicio local
-- ------------------------------------------------------------
--
-- `arkia-whisper` es el nombre del contenedor dentro de la red
-- `supabase_default`, que es donde también corre la aplicación. No sale a
-- internet ni pasa por nginx: es una llamada entre contenedores.
--
-- La clave queda VACÍA a propósito. El servicio local no autentica nada, y
-- rellenarla con un valor de relleno tipo 'local' sería peor que dejarla
-- nula: las claves se guardan cifradas, así que el código intentaría
-- descifrar «local», fallaría, y se saltaría la transcripción entera sin más
-- señal que una línea en el registro. Es `transcription_kind` quien decide
-- si hace falta clave, no su presencia.

update ai_configs
set transcription_kind = 'whispercpp',
    transcription_base_url = 'http://arkia-whisper:8080',
    transcription_model = 'ggml-base'
where transcription_api_key is null
   or transcription_api_key = '';
