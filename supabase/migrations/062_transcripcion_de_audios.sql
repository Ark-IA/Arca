-- ============================================================
-- Transcripción de notas de voz
-- ============================================================
--
-- Un cliente que manda un audio está diciendo algo, y hasta ahora ese algo no
-- llegaba a ninguna parte: el mensaje se guardaba sin texto, los flujos no
-- encontraban ninguna palabra que reconocer y el agente de IA ni siquiera veía
-- que hubiera llegado un mensaje. El bot enmudecía.
--
-- Transcribir lo arregla de raíz: el audio se convierte en texto y a partir de
-- ahí todo funciona exactamente igual que si el cliente hubiera escrito.
--
-- Va en columnas propias y NO reutilizando la clave del agente porque son dos
-- servicios distintos. La cuenta usa OpenRouter para conversar, y OpenRouter
-- no transcribe: solo expone chat. Obligar a que fuera la misma clave sería
-- impedir la función a quien ya eligió proveedor de conversación.

alter table ai_configs
  add column if not exists transcription_api_key text,
  -- El modelo por defecto es el de OpenAI; con Groq se pone
  -- `whisper-large-v3`, que habla el mismo protocolo y sale más barato.
  add column if not exists transcription_model text not null default 'whisper-1',
  -- La dirección base, sin `/audio/transcriptions`. Cualquier proveedor
  -- compatible con OpenAI sirve; se guarda entera para no tener que
  -- mantener una lista de proveedores conocidos en el código.
  add column if not exists transcription_base_url text not null
    default 'https://api.openai.com/v1';

comment on column ai_configs.transcription_api_key is
  'Clave del servicio que transcribe notas de voz. Vacía = no se transcribe, '
  'y entonces el agente responde diciendo que no puede escuchar el audio en '
  'vez de quedarse callado.';

-- El texto transcrito se guarda en `messages.content_text`, el mismo campo
-- que usa un mensaje escrito. Es deliberado: así todo lo que ya lee ese
-- campo —los flujos, las automatizaciones, el contexto del agente, la
-- búsqueda, la vista previa de la bandeja— funciona sin enterarse de que el
-- cliente habló en vez de escribir.
--
-- Se marca de dónde salió para no confundir una transcripción con algo que
-- la persona escribió: la interfaz lo muestra distinto y, si algún día una
-- transcripción sale mal, se puede saber cuáles revisar.
alter table messages
  add column if not exists transcrito boolean not null default false;

comment on column messages.transcrito is
  'true cuando content_text no lo escribió la persona sino que salió de '
  'transcribir su nota de voz.';
