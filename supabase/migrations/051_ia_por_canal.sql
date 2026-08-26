-- ============================================================
-- El agente de IA, por canal
-- ============================================================
--
-- Hasta ahora `auto_reply_enabled` era un sí o un no para toda la cuenta, y
-- daba igual: la IA solo estaba conectada al webhook de WhatsApp. Al sumar
-- Messenger e Instagram, encenderla de golpe en los tres sería una decisión
-- tomada por el sistema y no por quien atiende.
--
-- El caso real es mixto: la IA contesta bien las consultas repetidas de
-- WhatsApp, pero por Instagram entran mensajes de otra naturaleza y se
-- prefiere atenderlos a mano. Un interruptor por canal deja elegir.
--
-- El valor por defecto son los tres. Quien ya tenía la IA encendida en
-- WhatsApp la mantiene, y los canales nuevos arrancan igual que el que ya
-- funcionaba, que es lo que espera quien no lea esta nota.

alter table ai_configs add column if not exists auto_reply_channels text[]
  not null default array['whatsapp', 'facebook', 'instagram'];

-- Solo canales que existan. Sin esto, un error de escritura desde la API
-- guardaría 'whatsap' y la IA dejaría de contestar en ese canal sin que nada
-- lo explique.
alter table ai_configs drop constraint if exists ai_configs_canales_validos;
alter table ai_configs add constraint ai_configs_canales_validos
  check (auto_reply_channels <@ array['whatsapp', 'facebook', 'instagram']);

comment on column ai_configs.auto_reply_channels is
  'Canales donde el agente contesta solo. Se evalúa ADEMÁS de '
  'auto_reply_enabled: si la auto-respuesta está apagada, la lista no importa.';
