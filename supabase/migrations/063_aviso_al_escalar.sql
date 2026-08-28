-- ============================================================
-- Avisarle al cliente cuando el agente escala
-- ============================================================
--
-- Cuando el modelo decide que no puede responder, el despachador pausaba el
-- bot, escribía un resumen para quien tomara la conversación, asignaba… y no
-- le mandaba NADA al cliente.
--
-- Desde el lado de quien escribió, eso es indistinguible de que el sistema
-- esté roto: mandó un mensaje y no pasó nada. Se queda mirando el teléfono
-- sin saber si lo leyeron, y el humano puede tardar minutos u horas en
-- aparecer. El silencio es la peor de las respuestas posibles: no informa y
-- además parece una falla.
--
-- Una línea corta lo arregla. No promete un tiempo que no se puede cumplir;
-- solo confirma que el mensaje llegó y que viene una persona.

alter table ai_configs
  add column if not exists handoff_message text not null default
    'Dejame consultarlo con un compañero del equipo y te respondemos por acá. 🙌';

comment on column ai_configs.handoff_message is
  'Lo que se le manda al cliente cuando el agente entrega la conversación a '
  'una persona. Vacío = no se manda nada, que es como se comportaba antes: '
  'el cliente se quedaba esperando sin ninguna señal.';
