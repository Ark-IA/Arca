-- ============================================================
-- Escenario de atención de ARK-IA, completo y omnicanal
-- ============================================================
--
-- Monta la recepción real de la empresa: un cliente escribe por WhatsApp,
-- Messenger o Instagram y queda atendido sin que nadie mire la pantalla.
--
-- Las tres capas, y por qué cada una hace lo que hace:
--
--   FLUJO           Menú con opciones. Determinista: la misma pregunta da
--                   siempre la misma respuesta, y eso es lo que se quiere en
--                   la puerta de entrada. Corre PRIMERO.
--   AUTOMATIZACIONES Reaccionan a hechos, no conversan. Etiquetan, crean el
--                   negocio en el pipeline y asignan. Corren siempre.
--   AGENTE DE IA    Atiende lo que el menú no cubre, en lenguaje natural.
--                   Corre solo si ningún flujo consumió el mensaje.
--
--
-- LA DECISIÓN QUE GOBIERNA TODO EL DISEÑO
--
-- El motor se abstiene de usar la IA si existe UNA SOLA automatización activa
-- con disparador `new_message_received` o `keyword_match` -- en toda la
-- cuenta, no solo en esa conversación. Es una protección contra la doble
-- respuesta, y es correcta: dos respuestas al mismo mensaje es peor que una
-- imperfecta.
--
-- Por eso este escenario NO usa ninguno de esos dos disparadores. Las
-- automatizaciones se enganchan a `tag_added`: el flujo pone la etiqueta y la
-- automatización reacciona. Encadenarlas así deja las tres capas conviviendo
-- en vez de anularse.

do $$
declare
  v_cuenta   uuid;
  v_dueno    uuid;
  v_pipeline uuid;
  v_etapa    uuid;

  t_interes    uuid;
  t_soporte    uuid;
  t_automat    uuid;
  t_agentes    uuid;
  t_voz        uuid;
  t_telefonia  uuid;

  v_flujo uuid;
  v_auto  uuid;
  v_paso  uuid;
begin
  -- La cuenta ARK-IA y su dueño.
  select a.id, a.owner_user_id into v_cuenta, v_dueno
  from accounts a where a.name = 'ARK-IA' limit 1;

  if v_cuenta is null then
    raise notice 'No se encontro la cuenta ARK-IA; no se crea nada.';
    return;
  end if;

  -- El pipeline donde caen los negocios. Se toma el que ya existe en español.
  select p.id into v_pipeline from pipelines p
  where p.account_id = v_cuenta and p.name = 'Ventas Pipeline' limit 1;
  select s.id into v_etapa from pipeline_stages s
  where s.pipeline_id = v_pipeline and s.name = 'Nuevo Lead' limit 1;

  -- ============================================================
  -- 1. ETIQUETAS
  -- ============================================================
  -- Son el pegamento entre las capas: el flujo etiqueta, la automatización
  -- reacciona a la etiqueta, y el informe se filtra por ella. Sin etiquetas,
  -- cada capa tendría que adivinar lo que hizo la anterior.
  insert into tags (user_id, account_id, name, color)
  select v_dueno, v_cuenta, x.nombre, x.color
  from (values
    ('Interesado',       '#00FFA2'),
    ('Soporte',          '#F59E0B'),
    ('Automatizaciones', '#22D3EE'),
    ('Agentes IA',       '#A78BFA'),
    ('Agentes de voz',   '#F472B6'),
    ('Telefonía',        '#60A5FA')
  ) as x(nombre, color)
  where not exists (
    select 1 from tags t where t.account_id = v_cuenta and t.name = x.nombre
  );

  select id into t_interes   from tags where account_id=v_cuenta and name='Interesado';
  select id into t_soporte   from tags where account_id=v_cuenta and name='Soporte';
  select id into t_automat   from tags where account_id=v_cuenta and name='Automatizaciones';
  select id into t_agentes   from tags where account_id=v_cuenta and name='Agentes IA';
  select id into t_voz       from tags where account_id=v_cuenta and name='Agentes de voz';
  select id into t_telefonia from tags where account_id=v_cuenta and name='Telefonía';

  -- ============================================================
  -- 2. LIMPIEZA de lo que no se usa
  -- ============================================================
  -- El flujo anterior se disparaba con palabras en INGLÉS ('support', 'help',
  -- 'hi') sobre clientes que escriben en español: por eso nunca se ejecutó
  -- (flow_runs vacío). La automatización de bienvenida se reemplaza por el
  -- flujo, que hace lo mismo y además ofrece opciones.
  delete from flows       where user_id = v_dueno and name = 'Inicio-ARK-IA';
  delete from automations where user_id = v_dueno and name = 'Mensaje de Bienvenida';
  -- Y las que este script vuelva a crear, para que sea reejecutable.
  delete from flows       where user_id = v_dueno and name = 'Recepción ARK-IA';
  delete from automations where user_id = v_dueno and name in (
    'Interés comercial → negocio', 'Soporte → asignar', 'Marcar primer contacto'
  );

  -- ============================================================
  -- 3. EL FLUJO
  -- ============================================================
  -- Se dispara con el PRIMER mensaje, no con palabras clave: quien escribe
  -- por primera vez no sabe qué palabra decir, y pedirle que adivine es
  -- exactamente el error del flujo anterior.
  insert into flows (user_id, account_id, name, description, status, trigger_type,
                     trigger_config, entry_node_id, fallback_policy)
  values (
    v_dueno, v_cuenta,
    'Recepción ARK-IA',
    'Menú de entrada omnicanal: clasifica al cliente y lo deriva, o le cede el turno al agente de IA.',
    'active',
    'first_inbound_message',
    '{}'::jsonb,
    'inicio',
    -- Si el cliente contesta algo que no es una opción, se le repregunta dos
    -- veces y después pasa a una persona. Insistir más es maltratar.
    '{"on_unknown_reply":"reprompt","max_reprompts":2,"on_timeout_hours":24,"on_exhaust":"handoff"}'::jsonb
  )
  returning id into v_flujo;

  insert into flow_nodes (flow_id, node_key, node_type, config) values

  (v_flujo, 'inicio', 'start', '{"next_node_key":"menu"}'::jsonb),

  -- Tres botones porque WhatsApp no admite más. El menú fino va en el
  -- segundo nivel, con lista.
  (v_flujo, 'menu', 'send_buttons', jsonb_build_object(
    'header_text', 'ARK-IA',
    'text', E'¡Hola! 👋 Soy el asistente de ARK-IA.\n\nAutomatizamos la atención de empresas con agentes de IA, voz y telefonía.\n\n¿Con qué te ayudo?',
    'footer_text', 'Respondé tocando una opción',
    'buttons', jsonb_build_array(
      jsonb_build_object('reply_id','opt_soluciones','title','Ver soluciones','next_node_key','soluciones'),
      jsonb_build_object('reply_id','opt_soporte',  'title','Soy cliente',    'next_node_key','soporte_detalle'),
      jsonb_build_object('reply_id','opt_asesor',   'title','Hablar con alguien','next_node_key','marcar_interes')
    )
  )),

  -- Segundo nivel: las cuatro líneas de producto.
  (v_flujo, 'soluciones', 'send_list', jsonb_build_object(
    'header_text', 'Nuestras soluciones',
    'text', '¿Cuál te interesa? Te cuento en 30 segundos.',
    'button_label', 'Ver opciones',
    'sections', jsonb_build_array(jsonb_build_object(
      'title', 'Soluciones ARK-IA',
      'rows', jsonb_build_array(
        jsonb_build_object('reply_id','sol_automat','title','Automatizaciones',
          'description','Procesos que se ejecutan solos','next_node_key','tag_automat'),
        jsonb_build_object('reply_id','sol_agentes','title','Agentes IA (chat)',
          'description','Atienden por WhatsApp, Messenger e Instagram','next_node_key','tag_agentes'),
        jsonb_build_object('reply_id','sol_voz','title','Agentes de voz',
          'description','Contestan y llaman por teléfono','next_node_key','tag_voz'),
        jsonb_build_object('reply_id','sol_telefonia','title','Telefonía',
          'description','Central, extensiones y grabación','next_node_key','tag_telefonia')
      )
    ))
  )),

  -- Cada línea: etiqueta -> explicación -> cierre. La etiqueta va PRIMERO
  -- porque es lo que dispara la automatización del negocio; si fuera al final
  -- y el cliente abandonara, el interés quedaría sin registrar.
  (v_flujo, 'tag_automat', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_automat, 'next_node_key','pitch_automat')),
  (v_flujo, 'pitch_automat', 'send_message', jsonb_build_object(
    'text', E'⚙️ *Automatizaciones*\n\nConectamos tus sistemas para que el trabajo repetitivo desaparezca: respuestas, seguimientos, cargas de datos y avisos internos.\n\nUn caso típico: una empresa pasó de 4 horas diarias de trabajo manual a 20 minutos de revisión.',
    'next_node_key','marcar_interes')),

  (v_flujo, 'tag_agentes', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_agentes, 'next_node_key','pitch_agentes')),
  (v_flujo, 'pitch_agentes', 'send_message', jsonb_build_object(
    'text', E'🤖 *Agentes de IA para chat*\n\nAtienden por WhatsApp, Messenger e Instagram con el tono de tu marca, resuelven las preguntas de siempre y le pasan a una persona lo que de verdad la necesita.\n\nDe hecho, esta conversación es uno.',
    'next_node_key','marcar_interes')),

  (v_flujo, 'tag_voz', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_voz, 'next_node_key','pitch_voz')),
  (v_flujo, 'pitch_voz', 'send_message', jsonb_build_object(
    'text', E'🎙️ *Agentes de voz*\n\nContestan el teléfono, entienden lo que se les dice y resuelven o derivan. Sin menús de «marque 1».\n\nSirven igual para llamar: confirmaciones, cobranza y encuestas.',
    'next_node_key','marcar_interes')),

  (v_flujo, 'tag_telefonia', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_telefonia, 'next_node_key','pitch_telefonia')),
  (v_flujo, 'pitch_telefonia', 'send_message', jsonb_build_object(
    'text', E'☎️ *Telefonía*\n\nCentral propia con extensiones por agente, llamadas desde el navegador, grabación y estadísticas. Todo integrado al CRM: al entrar una llamada ya sabés quién es.',
    'next_node_key','marcar_interes')),

  -- El cierre comercial. La etiqueta «Interesado» es la que dispara la
  -- creación del negocio en el pipeline.
  (v_flujo, 'marcar_interes', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_interes, 'next_node_key','cierre')),

  (v_flujo, 'cierre', 'send_buttons', jsonb_build_object(
    'text', E'¿Querés que un especialista te contacte para ver tu caso concreto?',
    'footer_text', 'Sin compromiso',
    'buttons', jsonb_build_array(
      jsonb_build_object('reply_id','cierre_si','title','Sí, quiero','next_node_key','derivar_comercial'),
      jsonb_build_object('reply_id','cierre_pregunta','title','Tengo una duda','next_node_key','libre'),
      jsonb_build_object('reply_id','cierre_no','title','Solo miraba','next_node_key','despedida')
    )
  )),

  -- Soporte: se captura el detalle ANTES de derivar. Que un cliente cuente su
  -- problema dos veces -- una al bot y otra a la persona -- es la queja más
  -- común de este tipo de sistemas.
  (v_flujo, 'soporte_detalle', 'collect_input', jsonb_build_object(
    'prompt_text', E'Perfecto 🙌 Contame en un mensaje qué está pasando y con qué servicio, así el equipo llega con contexto.',
    'var_key', 'detalle_soporte',
    'next_node_key', 'tag_soporte')),
  (v_flujo, 'tag_soporte', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_soporte, 'next_node_key','derivar_soporte')),
  (v_flujo, 'derivar_soporte', 'handoff', jsonb_build_object(
    'note', 'Soporte. El cliente reporta: {{vars.detalle_soporte}}',
    'assign_to', v_dueno)),

  (v_flujo, 'derivar_comercial', 'handoff', jsonb_build_object(
    'note', 'Pidió contacto comercial desde el menú de recepción.',
    'assign_to', v_dueno)),

  -- «Tengo una duda» termina el flujo SIN derivar, y ahí está la gracia: al
  -- terminar, el siguiente mensaje ya no lo consume ningún flujo y lo atiende
  -- el agente de IA. Es el punto exacto donde se pasa el testigo.
  (v_flujo, 'libre', 'send_message', jsonb_build_object(
    'text', E'Claro, preguntame lo que quieras 💬 Te respondo al instante.',
    'next_node_key','fin_libre')),
  (v_flujo, 'fin_libre', 'end', '{}'::jsonb),

  (v_flujo, 'despedida', 'send_message', jsonb_build_object(
    'text', E'¡Gracias por escribirnos! Quedamos acá para cuando lo necesites 🙂',
    'next_node_key','fin')),
  (v_flujo, 'fin', 'end', '{}'::jsonb);

  -- ============================================================
  -- 4. AUTOMATIZACIONES
  -- ============================================================

  -- 4.1 Interés detectado -> negocio en el pipeline.
  -- Disparador `tag_added`, NO `keyword_match`: así no silencia al agente.
  insert into automations (user_id, account_id, name, description, trigger_type, trigger_config, is_active)
  values (
    v_dueno, v_cuenta,
    'Interés comercial → negocio',
    'Cuando el flujo marca a alguien como Interesado, crea el negocio en el pipeline y lo asigna.',
    'tag_added',
    jsonb_build_object('tag_id', t_interes),
    true
  ) returning id into v_auto;

  insert into automation_steps (automation_id, step_type, step_config, position) values
    (v_auto, 'create_deal', jsonb_build_object(
      'pipeline_id', v_pipeline, 'stage_id', v_etapa,
      'title', 'Lead desde chat — {{contact.name}}'), 1),
    (v_auto, 'assign_conversation', jsonb_build_object(
      'mode', 'round_robin'), 2);

  -- 4.2 Soporte -> asignar de inmediato.
  insert into automations (user_id, account_id, name, description, trigger_type, trigger_config, is_active)
  values (
    v_dueno, v_cuenta,
    'Soporte → asignar',
    'Un cliente con problema no espera en la cola común: se asigna apenas el flujo lo etiqueta.',
    'tag_added',
    jsonb_build_object('tag_id', t_soporte),
    true
  ) returning id into v_auto;

  insert into automation_steps (automation_id, step_type, step_config, position) values
    (v_auto, 'assign_conversation', jsonb_build_object('mode','round_robin'), 1);

  raise notice 'Escenario ARK-IA creado. Flujo: %', v_flujo;
end $$;
