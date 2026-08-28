-- ============================================================
-- Los textos que lee el cliente, en español colombiano
-- ============================================================
--
-- Todo lo que escribí para los flujos y los avisos del agente salió en voseo
-- rioplatense: «querés», «contame», «acá», «tenés». El cliente es de
-- Colombia, donde no se vosea. No es un detalle de estilo: un cliente
-- colombiano lo nota en el primer mensaje, y en una demostración a una
-- empresa delata que los textos no se escribieron para ese mercado.
--
-- Se traduce nodo por nodo y no con reemplazos automáticos. «Contame» →
-- «Contame» sin tilde no existe, «Cuéntame» sí; y hay giros que cambian de
-- forma entera («preguntame lo que quieras» → «pregúntame lo que quieras»,
-- pero «¿querés que…?» → «¿quieres que…?»). Un sed sobre todo el texto deja
-- frases que nadie diría en voz alta.
--
-- NO se toca `unsupported_media_message`: ese texto lo escribió el cliente y
-- pidió expresamente dejarlo tal cual. Que el resto pase a colombiano no es
-- razón para volver a corregirle lo que ya decidió.

do $$
declare
  v_recepcion uuid;
  v_venta uuid;
begin
  select id into v_recepcion from flows where name = 'Recepción ARK-IA';
  select id into v_venta from flows where name = 'Intención de compra';

  -- ----------------------------------------------------------
  -- Recepción ARK-IA
  -- ----------------------------------------------------------

  -- «Respondé» → «Responde»
  update flow_nodes
  set config = jsonb_set(config, '{footer_text}', '"Responde tocando una opción"')
  where flow_id = v_recepcion and node_key = 'menu';

  -- «ya sabés quién es» → «ya sabes quién es»
  update flow_nodes
  set config = jsonb_set(config, '{text}', to_jsonb(
    E'☎️ *Telefonía*\n\nCentral propia con extensiones por agente, llamadas desde el navegador, grabación y estadísticas. Todo integrado al CRM: al entrar una llamada ya sabes quién es.'::text))
  where flow_id = v_recepcion and node_key = 'pitch_telefonia';

  -- «Contame» → «Cuéntame»
  update flow_nodes
  set config = jsonb_set(config, '{text}', to_jsonb(
    E'Perfecto 🙌 Cuéntame en un mensaje qué está pasando y con qué servicio.\n\nTe responde nuestro asistente al instante, y si el caso necesita a un especialista te lo paso enseguida.'::text))
  where flow_id = v_recepcion and node_key = 'soporte_ia';

  -- «¿Querés que…?» → «¿Quieres que…?»
  update flow_nodes
  set config = jsonb_set(config, '{text}',
    '"¿Quieres que un especialista te contacte para ver tu caso concreto?"')
  where flow_id = v_recepcion and node_key = 'cierre';

  -- «preguntame» → «pregúntame»
  update flow_nodes
  set config = jsonb_set(config, '{text}',
    '"Claro, pregúntame lo que quieras 💬 Te respondo al instante."')
  where flow_id = v_recepcion and node_key = 'libre';

  -- «acá» → «aquí»
  update flow_nodes
  set config = jsonb_set(config, '{text}',
    '"¡Gracias por escribirnos! Quedamos aquí para cuando lo necesites 🙂"')
  where flow_id = v_recepcion and node_key = 'despedida';

  -- «por acá», «si querés», «contame»
  update flow_nodes
  set config = jsonb_set(config, '{mensaje}', to_jsonb(
    E'¡Listo! 🙌 Ya le pasé tu caso a un especialista del equipo comercial.\n\nTe escribe por aquí en breve. Si quieres adelantarme algo mientras tanto, cuéntame.'::text))
  where flow_id = v_recepcion and node_key = 'derivar_comercial';

  -- ----------------------------------------------------------
  -- Intención de compra
  -- ----------------------------------------------------------

  -- «lo que ya tenés», «el volumen que manejás»
  update flow_nodes
  set config = jsonb_set(config, '{text}', to_jsonb(
    E'¡Gracias por preguntar! 💚\n\nEn ARK-IA no trabajamos con precios de lista: cada implementación se arma sobre lo que ya tienes y sobre el volumen que manejas, así que el número honesto sale después de entender tu caso.\n\nLa buena noticia es que esa conversación toma 15 minutos y sale con una propuesta concreta.'::text))
  where flow_id = v_venta and node_key = 'respuesta';

  -- «Preguntame» → «Pregúntame»
  update flow_nodes
  set config = jsonb_set(config, '{text}',
    '"Claro 💬 Pregúntame lo que quieras sobre cómo funciona, qué se puede automatizar en tu caso o cómo es la implementación."')
  where flow_id = v_venta and node_key = 'venta_libre';

  -- «escribinos», «desde acá»
  update flow_nodes
  set config = jsonb_set(config, '{text}',
    '"Perfecto, quedamos atentos 🙂 Cuando quieras retomarlo escríbenos «ventas» y seguimos desde aquí."')
  where flow_id = v_venta and node_key = 'venta_despedida';

  -- «por acá», «si querés», «escribime»
  update flow_nodes
  set config = jsonb_set(config, '{mensaje}', to_jsonb(
    E'¡Gracias! 🙌 Un especialista te contacta por aquí para ver tu caso.\n\nSi quieres adelantarme algo mientras tanto, escríbeme.'::text))
  where flow_id = v_venta and node_key = 'derivar_venta';

  -- ----------------------------------------------------------
  -- Botones
  -- ----------------------------------------------------------
  --
  -- «Contame más antes» → «Cuéntame más antes» (18 caracteres; el tope de
  -- Meta son 20, así que entra sin recortar).
  --
  -- `with ordinality` + `order by`: los botones son una lista ORDENADA y el
  -- cliente los ve en ese orden. Reconstruirla sin fijarlo funciona casi
  -- siempre, que es la peor clase de casi.
  update flow_nodes n
  set config = jsonb_set(n.config, '{buttons}', (
        select jsonb_agg(
                 case when b.valor->>'reply_id' = 'venta_info'
                      then jsonb_set(b.valor, '{title}', '"Cuéntame más antes"')
                      else b.valor end
                 order by b.orden)
        from jsonb_array_elements(n.config->'buttons') with ordinality as b(valor, orden)))
  where n.flow_id = v_venta and n.node_key = 'cierre_venta';

  -- ----------------------------------------------------------
  -- Avisos del agente de IA
  -- ----------------------------------------------------------
  --
  -- «Dejame» → «Déjame», «por acá» → «por aquí».
  update ai_configs
  set handoff_message =
    'Déjame consultarlo con un compañero del equipo y te respondemos por aquí. 🙌';

  raise notice 'Textos pasados a español colombiano.';
end $$;
