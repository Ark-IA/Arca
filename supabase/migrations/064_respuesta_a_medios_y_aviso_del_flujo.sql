-- ============================================================
-- Nadie se queda sin respuesta
-- ============================================================
--
-- Dos huecos con la misma forma: el cliente manda algo y no recibe nada.
--
--   1. Manda una nota de voz que no se pudo transcribir. El agente le
--      preguntaba al modelo qué hacer, y el modelo escalaba a un humano:
--      con la base de conocimiento activa, el último bloque del prompt dice
--      «si no cubren la pregunta, no adivines: escalá», y una descripción de
--      audio no está cubierta por ninguna documentación. Escalaba porque
--      alguien habló en vez de escribir.
--
--   2. Toca «Sí, quiero que me contacte un especialista» en el menú. El nodo
--      de entrega del flujo cambia el estado de la conversación, deja una
--      nota interna para el equipo… y no le manda nada a quien lo tocó. Se
--      queda mirando el teléfono después de decir que sí.
--
-- El segundo es peor que el primero, porque el cliente acaba de hacer
-- exactamente lo que el menú le pidió que hiciera.

-- ------------------------------------------------------------
-- 1. Qué contestar a un audio que no se puede escuchar
-- ------------------------------------------------------------
--
-- Es una respuesta fija y no una decisión del modelo. La situación tiene una
-- sola respuesta correcta, y preguntársela salía caro en las tres monedas:
-- dinero, segundos de espera y fiabilidad.

alter table ai_configs
  add column if not exists unsupported_media_message text not null default
    'Recibí tu mensaje 🙌 pero no puedo escuchar audios ni ver imágenes por acá. ¿Me lo escribís y seguimos?';

comment on column ai_configs.unsupported_media_message is
  'Respuesta automática cuando el cliente manda una nota de voz, imagen o '
  'archivo que el agente no puede percibir y no hay transcripción. Vacío = '
  'no se responde, y entonces el cliente se queda sin señal.';

-- ------------------------------------------------------------
-- 2. El nodo de entrega, con voz
-- ------------------------------------------------------------
--
-- El nodo ya tenía `note`, pero es una nota INTERNA para quien tome la
-- conversación. Lo que faltaba era qué decirle al cliente. Se guarda por
-- nodo y no en un ajuste global porque el texto correcto depende de a dónde
-- va: «un especialista te contacta» y «soporte te escribe» no son lo mismo.

do $$
declare
  v_cuenta uuid;
begin
  select a.id into v_cuenta from accounts a where a.name = 'ARK-IA' limit 1;
  if v_cuenta is null then return; end if;

  update flow_nodes n
  set config = n.config || jsonb_build_object(
        'mensaje',
        E'¡Listo! 🙌 Ya le pasé tu caso a un especialista del equipo comercial.\n\nTe escribe por acá en breve. Si querés adelantarme algo mientras tanto, contame.')
  from flows f
  where f.id = n.flow_id
    and f.account_id = v_cuenta
    and n.node_type = 'handoff'
    and n.node_key = 'derivar_comercial';

  update flow_nodes n
  set config = n.config || jsonb_build_object(
        'mensaje',
        E'¡Gracias! 🙌 Un especialista te contacta por acá para ver tu caso.\n\nSi querés adelantarme algo mientras tanto, escribime.')
  from flows f
  where f.id = n.flow_id
    and f.account_id = v_cuenta
    and n.node_type = 'handoff'
    and n.node_key = 'derivar_venta';
end $$;
