-- ============================================================
-- La IA atiende primero; el humano entra cuando hace falta
-- ============================================================
--
-- El escenario original mandaba a un humano ANTES de que la IA dijera una
-- palabra. Dos caminos lo hacían:
--
--   1. «Soy cliente» -> recoger el detalle -> derivar_soporte (handoff)
--   2. Cualquier texto fuera del menú -> 2 reintentos -> on_exhaust: handoff
--
-- Y un handoff asigna un agente, lo que apaga la autorespuesta de la IA en
-- esa conversación de forma permanente. Se ve en los datos: un cliente
-- escribió «Tengo una duda» y después «Hola» y no le contestó nadie, porque
-- el flujo ya había entregado la conversación a una persona que no estaba
-- mirando.
--
-- La IA ya sabe escalar sola: cuando el modelo no puede responder devuelve
-- `handoff` y el despachador apaga la autorespuesta, deja una nota de
-- contexto y asigna. Es decir, la escalada existía; lo que sobraba era
-- escalar antes de intentar.
--
-- Este es el orden nuevo:
--
--   flujo (menú determinista)  ->  IA (conversación libre)  ->  humano
--
-- El humano sigue entrando de inmediato en un solo caso, y a propósito:
-- cuando el cliente PIDE hablar con una persona. Ahí insistir con un bot es
-- desoír lo único que pidió.

do $$
declare
  v_cuenta uuid;
  v_dueno  uuid;
  v_flujo  uuid;
begin
  select a.id, a.owner_user_id into v_cuenta, v_dueno
  from accounts a where a.name = 'ARK-IA' limit 1;
  if v_cuenta is null then
    raise notice 'No se encontro la cuenta ARK-IA.';
    return;
  end if;

  select id into v_flujo from flows where name = 'Recepción ARK-IA';
  if v_flujo is null then
    raise notice 'No existe el flujo de recepcion.';
    return;
  end if;

  -- ----------------------------------------------------------
  -- 1. La rama de soporte deja de terminar en un humano
  -- ----------------------------------------------------------
  --
  -- Antes: menu -> soporte_detalle (recoge el problema) -> tag_soporte ->
  --        derivar_soporte (handoff)
  --
  -- Ahora: menu -> tag_soporte -> soporte_ia (pide el detalle) -> fin
  --
  -- El cambio importante no es quitar el handoff, es NO CONSUMIR el mensaje
  -- donde el cliente describe su problema. `collect_input` se lo tragaba: el
  -- flujo lo guardaba en una variable y la IA nunca llegaba a contestarlo,
  -- así que el cliente escribía su problema y recibía silencio.
  --
  -- Terminando el flujo justo ANTES de esa descripción, el mensaje llega
  -- sin dueño y lo atiende la IA, que además ve todo el historial anterior.

  update flow_nodes
  set config = jsonb_build_object(
        'mode', config->>'mode',
        'tag_id', config->>'tag_id',
        'next_node_key', 'soporte_ia')
  where flow_id = v_flujo and node_key = 'tag_soporte';

  -- El menú apunta directo a la etiqueta: se salta el collect_input.
  --
  -- `with ordinality` + `order by` no es adorno: los botones son una lista
  -- ordenada y el cliente los ve en ese orden. Reconstruirla sin fijar el
  -- orden funciona casi siempre, que es la peor clase de casi.
  update flow_nodes
  set config = jsonb_set(config, '{buttons}', (
        select jsonb_agg(
                 case when b.valor->>'reply_id' = 'opt_soporte'
                      then jsonb_set(b.valor, '{next_node_key}', '"tag_soporte"')
                      else b.valor end
                 order by b.orden)
        from jsonb_array_elements(config->'buttons') with ordinality as b(valor, orden)))
  where flow_id = v_flujo and node_key = 'menu';

  -- Reejecutable sin depender de que exista un índice único (flow_id, node_key).
  delete from flow_nodes
  where flow_id = v_flujo and node_key in ('soporte_ia', 'fin_soporte');

  insert into flow_nodes (flow_id, node_key, node_type, config) values
  (v_flujo, 'soporte_ia', 'send_message', jsonb_build_object(
    'text', E'Perfecto 🙌 Contame en un mensaje qué está pasando y con qué servicio.\n\nTe responde nuestro asistente al instante, y si el caso necesita a un especialista te lo paso enseguida.',
    'next_node_key', 'fin_soporte')),
  (v_flujo, 'fin_soporte', 'end', '{}'::jsonb);

  -- Los dos nodos que quedaron sin uso.
  delete from flow_nodes
  where flow_id = v_flujo and node_key in ('soporte_detalle', 'derivar_soporte');

  -- ----------------------------------------------------------
  -- 2. Agotar el menú ya no significa despertar a un humano
  -- ----------------------------------------------------------
  --
  -- `on_exhaust: end` cierra la ejecución como completada, y a partir del
  -- siguiente mensaje contesta la IA. Antes era `handoff`, que asignaba la
  -- conversación y la dejaba muda.
  --
  -- Y un solo reintento en vez de dos: repetir el menú por segunda vez a
  -- quien claramente quiere escribir en texto libre es discutir con él.
  -- Con un aviso alcanza; después conviene dejarlo hablar.
  update flows
  set fallback_policy = jsonb_build_object(
        'on_unknown_reply', 'reprompt',
        'max_reprompts', 1,
        'on_timeout_hours', 24,
        'on_exhaust', 'end')
  where account_id = v_cuenta;

  -- ----------------------------------------------------------
  -- 3. La escalada de la IA aterriza en alguien
  -- ----------------------------------------------------------
  --
  -- Cuando el modelo decide que no puede responder, el despachador apaga la
  -- autorespuesta y asigna la conversación al agente de escalado. Ese campo
  -- estaba vacío, así que la conversación quedaba en la cola compartida sin
  -- dueño: escalaba a nadie. Ahora tiene destinatario.
  update ai_configs
  set handoff_agent_id = v_dueno
  where account_id = v_cuenta and handoff_agent_id is null;

  -- ----------------------------------------------------------
  -- 4. Etiquetar «Soporte» ya no asigna un humano
  -- ----------------------------------------------------------
  --
  -- La automatización se queda escrita y visible en el módulo, pero apagada:
  -- asignaba en cuanto entraba la etiqueta, que es precisamente lo que le
  -- quitaba el turno a la IA. La etiqueta se sigue poniendo, porque sirve
  -- para medir cuántas conversaciones son de soporte.
  --
  -- Para volver al comportamiento anterior basta con activarla desde el
  -- módulo de automatizaciones; no hace falta tocar nada más.
  update automations
  set is_active = false
  where account_id = v_cuenta and name = 'Soporte → asignar';

  -- ----------------------------------------------------------
  -- 5. Palabras de venta que no pisen a las de soporte
  -- ----------------------------------------------------------
  --
  -- Ahora que un mensaje de soporte llega en texto libre, las palabras del
  -- flujo comercial pasan a ser peligrosas: la coincidencia es «contiene»,
  -- y sobre raíces cortas eso agarra de más.
  --
  --   «plan»  aparece dentro de planilla, planeando, planta
  --   «demo»  aparece dentro de demora, demorado  <- vocabulario de soporte puro
  --   «costo» aparece dentro de «me costo entender», sin tilde, que es como
  --           la escribe casi todo el mundo
  --
  -- Un cliente enojado escribiendo «la plataforma está demorada» terminaría
  -- en el discurso comercial. Se quitan las raíces ambiguas y se dejan las
  -- que solo aparecen cuando de verdad se habla de dinero, más las frases
  -- completas, que son largas y por eso seguras.
  update flows
  set trigger_config = jsonb_build_object(
        'keywords', jsonb_build_array(
          'precio', 'precios',
          'cotizacion', 'cotización', 'cotizar',
          'tarifa', 'tarifas',
          'presupuesto',
          'cuanto cuesta', 'cuánto cuesta',
          'cuanto vale', 'cuánto vale',
          'cuanto sale', 'cuánto sale',
          'planes',            -- el plural no cae dentro de «planilla»
          'ventas', 'comprar', 'contratar',
          'demostracion', 'demostración'
        ),
        'match_type', 'contains',
        'case_sensitive', false)
  where name = 'Intención de compra';

  raise notice 'Escenario reordenado: flujo -> IA -> humano.';
end $$;
