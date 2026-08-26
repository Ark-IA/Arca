-- ============================================================
-- Flujo de intención de compra
-- ============================================================
--
-- Quien escribe «precio», «cotización» o «ventas» ya declaró para qué escribe.
-- Mandarlo al menú de recepción sería hacerle elegir algo que ya eligió, y
-- cada paso de más es gente que abandona.
--
-- Por eso este flujo es corto y va directo al grano: etiqueta el interés
-- —lo que dispara la creación del negocio en el pipeline— y ofrece el
-- contacto comercial. Cinco nodos contra los veintiuno de la recepción.
--
-- Va en un flujo APARTE y no como palabras del de recepción porque entra por
-- otro nodo. Un mismo flujo tiene una sola entrada; dos intenciones distintas
-- necesitan dos.
--
-- Nota sobre el orden: el motor busca en dos pasadas. Primero las palabras
-- clave explícitas, y solo si ninguna coincide entra el flujo de bienvenida.
-- Por eso da igual cuál se creó antes: quien dice «precio» llega aquí aunque
-- sea su primer mensaje, y quien solo saluda va a la recepción.

do $$
declare
  v_cuenta uuid;
  v_dueno  uuid;
  t_interes uuid;
  v_flujo  uuid;
begin
  select a.id, a.owner_user_id into v_cuenta, v_dueno
  from accounts a where a.name = 'ARK-IA' limit 1;
  if v_cuenta is null then
    raise notice 'No se encontro la cuenta ARK-IA.';
    return;
  end if;

  select id into t_interes from tags
  where account_id = v_cuenta and name = 'Interesado';
  if t_interes is null then
    raise notice 'Falta la etiqueta Interesado; aplicar antes la migracion 052.';
    return;
  end if;

  -- Reejecutable.
  delete from flows where user_id = v_dueno and name = 'Intención de compra';

  insert into flows (user_id, account_id, name, description, status, trigger_type,
                     trigger_config, entry_node_id, fallback_policy)
  values (
    v_dueno, v_cuenta,
    'Intención de compra',
    'Atajo comercial: quien pregunta por precios o planes entra directo al cierre, con su negocio creado en el pipeline.',
    'active',
    'keyword',
    jsonb_build_object(
      'keywords', jsonb_build_array(
        'ventas', 'precio', 'precios', 'costo', 'costos',
        'cotizacion', 'cotización', 'cotizar',
        'plan', 'planes', 'tarifas',
        'demo', 'demostracion', 'demostración',
        'comprar', 'contratar', 'presupuesto'
      ),
      -- «contiene» y no exacta, al revés que en la recepción.
      --
      -- Aquí sí interesa pescar la frase entera: «cuánto cuesta el agente de
      -- voz» tiene que entrar. El riesgo de falso positivo es bajo porque
      -- estas palabras solo aparecen cuando de verdad se habla de dinero, y
      -- si entra de más el cliente igual termina en una conversación
      -- comercial, que es donde quería estar.
      'match_type', 'contains',
      'case_sensitive', false
    ),
    'inicio_venta',
    '{"on_unknown_reply":"reprompt","max_reprompts":2,"on_timeout_hours":24,"on_exhaust":"handoff"}'::jsonb
  )
  returning id into v_flujo;

  insert into flow_nodes (flow_id, node_key, node_type, config) values

  (v_flujo, 'inicio_venta', 'start', '{"next_node_key":"marcar"}'::jsonb),

  -- La etiqueta PRIMERO. Es lo que dispara la automatización que crea el
  -- negocio en el pipeline, y tiene que ocurrir aunque la persona no conteste
  -- nada más: el interés ya quedó demostrado al preguntar por el precio.
  (v_flujo, 'marcar', 'set_tag', jsonb_build_object(
    'mode','add','tag_id', t_interes, 'next_node_key','respuesta')),

  (v_flujo, 'respuesta', 'send_message', jsonb_build_object(
    'text', E'¡Gracias por preguntar! 💚\n\nEn ARK-IA no trabajamos con precios de lista: cada implementación se arma sobre lo que ya tenés y sobre el volumen que manejás, así que el número honesto sale después de entender tu caso.\n\nLa buena noticia es que esa conversación toma 15 minutos y sale con una propuesta concreta.',
    'next_node_key','cierre_venta')),

  (v_flujo, 'cierre_venta', 'send_buttons', jsonb_build_object(
    'text', E'¿Cómo seguimos?',
    'footer_text', 'Sin compromiso',
    'buttons', jsonb_build_array(
      jsonb_build_object('reply_id','venta_agendar','title','Quiero la reunión','next_node_key','derivar_venta'),
      jsonb_build_object('reply_id','venta_info','title','Contame más antes','next_node_key','venta_libre'),
      jsonb_build_object('reply_id','venta_luego','title','Más adelante','next_node_key','venta_despedida')
    )
  )),

  (v_flujo, 'derivar_venta', 'handoff', jsonb_build_object(
    'note', 'Preguntó por precios y pidió reunión comercial. Negocio ya creado en el pipeline.',
    'assign_to', v_dueno)),

  -- «Contame más antes» cierra el flujo sin derivar: a partir del siguiente
  -- mensaje contesta el agente de IA, que puede explicar el producto en
  -- lenguaje natural. El negocio ya quedó en el pipeline igual, así que el
  -- seguimiento comercial no depende de que la conversación siga.
  (v_flujo, 'venta_libre', 'send_message', jsonb_build_object(
    'text', E'Claro 💬 Preguntame lo que quieras sobre cómo funciona, qué se puede automatizar en tu caso o cómo es la implementación.',
    'next_node_key','venta_fin')),
  (v_flujo, 'venta_fin', 'end', '{}'::jsonb),

  (v_flujo, 'venta_despedida', 'send_message', jsonb_build_object(
    'text', E'Perfecto, quedamos atentos 🙂 Cuando quieras retomarlo escribinos «ventas» y seguimos desde acá.',
    'next_node_key','venta_fin2')),
  (v_flujo, 'venta_fin2', 'end', '{}'::jsonb);

  raise notice 'Flujo de intencion de compra creado: %', v_flujo;
end $$;
