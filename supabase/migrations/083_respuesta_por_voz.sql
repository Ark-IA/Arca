-- ============================================================
-- Respuesta por voz del agente de IA
-- ============================================================
--
-- Cuándo contesta el agente con una nota de voz (clonada con la muestra de
-- la cuenta, ver servicios/tts) en vez de con texto:
--
--   nunca     como hasta ahora
--   si_audio  solo cuando el cliente mandó una nota de voz: quien habla
--             espera que le hablen, quien escribe espera leer
--   siempre   a todo
--
-- La muestra de voz no vive en la base: la guarda el servicio de voz. Acá
-- solo se anota cuándo se subió, para que la pantalla sepa si hay una.

alter table ai_configs
  add column if not exists voz_modo text not null default 'nunca',
  add column if not exists voz_muestra_subida_en timestamptz;

alter table ai_configs drop constraint if exists ai_configs_voz_modo_check;
alter table ai_configs add constraint ai_configs_voz_modo_check
  check (voz_modo in ('nunca', 'si_audio', 'siempre'));
