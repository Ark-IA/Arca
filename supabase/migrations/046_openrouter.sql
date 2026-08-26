-- ============================================================
-- OpenRouter como tercer proveedor de IA
-- ============================================================
--
-- La 029 fijó la restriccion en ('openai', 'anthropic'). Sin tocarla, guardar
-- la configuracion con OpenRouter fallaria en la base con un error de
-- restriccion -- que llega a la interfaz como un 500 generico y manda a
-- buscar el problema al sitio equivocado.
--
-- OpenRouter no es un modelo mas: es un intermediario que con UNA clave da
-- acceso a los modelos de OpenAI, Anthropic, Google, Meta y demas. Para quien
-- usa el CRM, cambiar de modelo pasa a ser editar un campo de texto en vez de
-- abrir otra cuenta y cargar otra tarjeta.

alter table ai_configs drop constraint if exists ai_configs_provider_check;
alter table ai_configs add constraint ai_configs_provider_check
  check (provider in ('openai', 'anthropic', 'openrouter'));

comment on column ai_configs.provider is
  'Proveedor de IA: openai, anthropic u openrouter (pasarela a muchos modelos con una sola clave).';

comment on column ai_configs.embeddings_api_key is
  'Clave compatible con OpenAI SOLO para embeddings. Va aparte porque OpenRouter '
  'no expone endpoint de embeddings: quien use OpenRouter para responder sigue '
  'necesitando una clave de OpenAI si quiere busqueda semantica en la base de '
  'conocimiento. Sin ella, la busqueda cae a texto completo y sigue funcionando.';
