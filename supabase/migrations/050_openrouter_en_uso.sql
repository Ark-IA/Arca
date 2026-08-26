-- ============================================================
-- OpenRouter también en el registro de uso
-- ============================================================
--
-- La 046 amplió la restricción de `ai_configs.provider` a openrouter, pero se
-- olvidó de `ai_usage_log.provider`, que quedó en ('openai','anthropic').
--
-- El efecto fue silencioso y por eso peor: la IA respondía bien -- el mensaje
-- llegaba al cliente -- y solo fallaba el apunte del consumo. `logAiUsage` es
-- best-effort y se traga sus errores para no tumbar una respuesta que el
-- cliente está esperando, así que el único rastro quedaba en el registro del
-- contenedor. Desde fuera parecía que la IA no se estaba usando.

alter table ai_usage_log drop constraint if exists ai_usage_log_provider_check;
alter table ai_usage_log add constraint ai_usage_log_provider_check
  check (provider in ('openai', 'anthropic', 'openrouter'));

comment on column ai_usage_log.provider is
  'Proveedor que atendió la llamada. Tiene que aceptar los MISMOS valores que '
  'ai_configs.provider: si se suma uno allá y no acá, el gasto deja de '
  'registrarse sin que nadie se entere.';
