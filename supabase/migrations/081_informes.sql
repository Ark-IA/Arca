-- ============================================================
-- Informes
-- ============================================================
--
-- Una función que agrega en la base todo lo que muestra la pantalla de
-- Informes para un rango de fechas. Se hace acá y no en el navegador porque
-- PostgREST corta en 1.000 filas: un informe de tres meses sumado en el
-- cliente daría números menores a los reales, sin avisar.
--
-- SECURITY INVOKER (el valor por defecto) a propósito: corre con los
-- permisos de quien pregunta, así que RLS sigue mandando. Un asesor que solo
-- ve sus conversaciones ve un informe de sus conversaciones.
--
-- Las fechas del gráfico diario se cortan en la zona horaria que se pasa
-- (Colombia por defecto): un mensaje de las 9 p. m. del lunes no puede
-- aparecer en el martes.
--
-- Negocios ganados o perdidos: la tabla no guarda cuándo se cerraron, así
-- que se usa `updated_at` de los que están en ese estado. Es una
-- aproximación: editar un negocio ya ganado lo mueve de fecha.

-- CONCURRENTLY: `messages` es la tabla más grande y la escriben los
-- webhooks sin parar; un índice normal la bloquearía mientras se construye.
-- (Por eso esta sentencia va sola y fuera de cualquier transacción.)
create index concurrently if not exists idx_messages_conversacion_fecha
  on messages (conversation_id, created_at);

create or replace function public.informe_general(
  p_cuenta uuid,
  p_desde  timestamptz,
  p_hasta  timestamptz,
  p_zona   text default 'America/Bogota'
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if not is_account_member(p_cuenta) then
    raise exception 'sin acceso a la cuenta' using errcode = '42501';
  end if;

  -- ---------------- Atención ----------------
  with conv as (
    select c.id, c.assigned_agent_id, coalesce(c.channel, 'whatsapp') as canal, c.status, c.created_at
    from conversations c
    where c.account_id = p_cuenta
      and c.created_at >= p_desde and c.created_at < p_hasta
  ),
  msg as (
    select m.conversation_id, m.sender_type, m.sender_id, m.created_at
    from messages m
    join conversations c on c.id = m.conversation_id
    where c.account_id = p_cuenta
      and m.created_at >= p_desde and m.created_at < p_hasta
  ),
  -- Primera respuesta: desde el primer mensaje del cliente hasta la primera
  -- respuesta (persona o bot) posterior, en conversaciones nacidas en el rango.
  primeras as (
    select conv.id, conv.assigned_agent_id,
      (select min(m.created_at) from messages m
        where m.conversation_id = conv.id and m.sender_type = 'customer') as pregunta
    from conv
  ),
  respuesta as (
    select p.id, p.assigned_agent_id,
      extract(epoch from (
        (select min(m.created_at) from messages m
          where m.conversation_id = p.id and m.sender_type in ('agent', 'bot')
            and m.created_at >= p.pregunta)
        - p.pregunta)) / 60.0 as minutos
    from primeras p
    where p.pregunta is not null
  )
  select v || jsonb_build_object(
    'atencion', jsonb_build_object(
      'conversaciones_nuevas', (select count(*) from conv),
      'mensajes_recibidos',    (select count(*) from msg where sender_type = 'customer'),
      'mensajes_enviados',     (select count(*) from msg where sender_type = 'agent'),
      'mensajes_bot',          (select count(*) from msg where sender_type = 'bot'),
      'primera_respuesta_mediana_min',
        (select round(percentile_cont(0.5) within group (order by minutos)::numeric, 1)
           from respuesta where minutos is not null),
      'sin_respuesta', (select count(*) from respuesta where minutos is null),
      'abiertas_ahora', (select count(*) from conversations
                          where account_id = p_cuenta and status in ('open', 'pending'))
    ),
    'por_canal', coalesce((
      select jsonb_agg(jsonb_build_object('canal', canal, 'conversaciones', n) order by n desc)
      from (select canal, count(*) n from conv group by canal) x
    ), '[]'::jsonb),
    'por_asesor', coalesce((
      select jsonb_agg(fila order by (fila->>'mensajes')::int desc)
      from (
        select jsonb_build_object(
          'user_id', u.uid,
          'nombre', coalesce(pr.full_name, 'Sin nombre'),
          'conversaciones', (select count(*) from conv where conv.assigned_agent_id = u.uid),
          'mensajes', (select count(*) from msg where msg.sender_type = 'agent' and msg.sender_id = u.uid),
          'primera_respuesta_mediana_min',
            (select round(percentile_cont(0.5) within group (order by minutos)::numeric, 1)
               from respuesta r where r.assigned_agent_id = u.uid and r.minutos is not null),
          'cerradas', (select count(*) from conv where conv.assigned_agent_id = u.uid and conv.status = 'closed')
        ) as fila
        from (
          select assigned_agent_id as uid from conv where assigned_agent_id is not null
          union
          select sender_id from msg where sender_type = 'agent' and sender_id is not null
        ) u
        left join profiles pr on pr.user_id = u.uid
      ) t
    ), '[]'::jsonb)
  ) into v;

  -- ---------------- Serie diaria ----------------
  -- Una pasada por tabla, agrupada por día, y después se completa con los
  -- días sin movimiento. Contar día por día recorrería los mensajes una vez
  -- por cada día del rango.
  with dias as (
    select g::date as dia
    from generate_series(
      (p_desde at time zone p_zona)::date,
      ((p_hasta - interval '1 second') at time zone p_zona)::date,
      interval '1 day'
    ) g
  ),
  m as (
    select (m.created_at at time zone p_zona)::date as dia,
           count(*) filter (where m.sender_type = 'customer') as recibidos,
           count(*) filter (where m.sender_type in ('agent', 'bot')) as enviados
    from messages m
    join conversations c on c.id = m.conversation_id
    where c.account_id = p_cuenta
      and m.created_at >= p_desde and m.created_at < p_hasta
    group by 1
  ),
  ct as (
    select (created_at at time zone p_zona)::date as dia, count(*) as n
    from contacts
    where account_id = p_cuenta
      and created_at >= p_desde and created_at < p_hasta
    group by 1
  )
  select v || jsonb_build_object('serie_diaria', coalesce(jsonb_agg(jsonb_build_object(
      'dia', to_char(dias.dia, 'YYYY-MM-DD'),
      'recibidos', coalesce(m.recibidos, 0),
      'enviados', coalesce(m.enviados, 0),
      'contactos_nuevos', coalesce(ct.n, 0)
    ) order by dias.dia), '[]'::jsonb))
  into v
  from dias
  left join m on m.dia = dias.dia
  left join ct on ct.dia = dias.dia;

  -- ---------------- Origen de los contactos nuevos ----------------
  with nuevos as (
    select ct.id,
      case
        when exists (select 1 from formularios_web f where f.contact_id = ct.id) then 'Formulario web'
        when ct.instagram_id is not null and ct.instagram_id <> '' then 'Instagram'
        when ct.facebook_id is not null and ct.facebook_id <> '' then 'Facebook'
        when exists (select 1 from conversations c where c.contact_id = ct.id) then 'WhatsApp'
        else 'Manual o importado'
      end as via
    from contacts ct
    where ct.account_id = p_cuenta
      and ct.created_at >= p_desde and ct.created_at < p_hasta
  ),
  web as (
    select coalesce(vw.primer_origen->>'fuente', 'Desconocido') as fuente,
           coalesce(vw.primer_origen->>'medio', 'other') as medio,
           vw.primer_origen->>'campana' as campana,
           count(distinct vw.contact_id) as n
    from visitantes_web vw
    join nuevos on nuevos.id = vw.contact_id
    group by 1, 2, 3
  )
  select v || jsonb_build_object(
    'origen', jsonb_build_object(
      'total', (select count(*) from nuevos),
      'por_via', coalesce((select jsonb_agg(jsonb_build_object('via', via, 'contactos', n) order by n desc)
                           from (select via, count(*) n from nuevos group by via) x), '[]'::jsonb),
      'web', coalesce((select jsonb_agg(jsonb_build_object('fuente', fuente, 'medio', medio, 'campana', campana, 'contactos', n) order by n desc)
                       from web), '[]'::jsonb),
      'formularios', jsonb_build_object(
        'recibidos', (select count(*) from formularios_web f
                       where f.account_id = p_cuenta and f.created_at >= p_desde and f.created_at < p_hasta),
        'con_contacto', (select count(*) from formularios_web f
                          where f.account_id = p_cuenta and f.created_at >= p_desde and f.created_at < p_hasta
                            and f.contact_id is not null),
        'omitidos', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo_omitido, 'n', n) order by n desc)
                     from (select motivo_omitido, count(*) n from formularios_web f
                            where f.account_id = p_cuenta and f.created_at >= p_desde and f.created_at < p_hasta
                              and f.motivo_omitido is not null
                            group by motivo_omitido) x), '[]'::jsonb)
      )
    )
  ) into v;

  -- ---------------- Ventas ----------------
  with d as (
    select id, status, value, created_at, updated_at, assigned_to, stage_id
    from deals where account_id = p_cuenta
  )
  select v || jsonb_build_object(
    'ventas', jsonb_build_object(
      'creados', (select count(*) from d where created_at >= p_desde and created_at < p_hasta),
      'ganados', (select count(*) from d where status = 'won' and updated_at >= p_desde and updated_at < p_hasta),
      'perdidos', (select count(*) from d where status = 'lost' and updated_at >= p_desde and updated_at < p_hasta),
      'valor_ganado', (select coalesce(sum(value), 0) from d where status = 'won' and updated_at >= p_desde and updated_at < p_hasta),
      'valor_abierto', (select coalesce(sum(value), 0) from d where status = 'open'),
      'abiertos', (select count(*) from d where status = 'open')
    ),
    'embudo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pipeline', p.name, 'etapa', s.name, 'color', s.color,
               'negocios', x.n, 'valor', x.valor) order by p.name, s.position)
      from (select stage_id, count(*) n, coalesce(sum(value), 0) valor
              from d where status = 'open' group by stage_id) x
      join pipeline_stages s on s.id = x.stage_id
      join pipelines p on p.id = s.pipeline_id
    ), '[]'::jsonb),
    'ventas_por_asesor', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', coalesce(pr.full_name, 'Sin asignar'),
               'ganados', x.ganados, 'valor_ganado', x.valor, 'abiertos', x.abiertos)
             order by x.valor desc)
      from (
        select assigned_to,
          count(*) filter (where status = 'won' and updated_at >= p_desde and updated_at < p_hasta) ganados,
          coalesce(sum(value) filter (where status = 'won' and updated_at >= p_desde and updated_at < p_hasta), 0) valor,
          count(*) filter (where status = 'open') abiertos
        from d group by assigned_to
      ) x
      left join profiles pr on pr.id = x.assigned_to
      where x.ganados > 0 or x.abiertos > 0
    ), '[]'::jsonb)
  ) into v;

  -- ---------------- Llamadas ----------------
  select v || jsonb_build_object(
    'llamadas', jsonb_build_object(
      'total', count(*),
      'entrantes', count(*) filter (where direction = 'inbound'),
      'salientes', count(*) filter (where direction = 'outbound'),
      'contestadas', count(*) filter (where answered_at is not null),
      'perdidas', count(*) filter (where direction = 'inbound' and answered_at is null
                                    and status in ('no_answer', 'canceled', 'busy', 'failed')),
      'duracion_media_s', round(avg(duration_seconds) filter (where duration_seconds > 0))
    )
  ) into v
  from call_logs
  where account_id = p_cuenta and started_at >= p_desde and started_at < p_hasta;

  -- ---------------- Masivos ----------------
  select v || jsonb_build_object(
    'masivos', coalesce(jsonb_agg(jsonb_build_object(
      'nombre', name, 'fecha', coalesce(scheduled_at, created_at),
      'destinatarios', total_recipients, 'enviados', sent_count, 'entregados', delivered_count,
      'leidos', read_count, 'respondidos', replied_count, 'fallidos', failed_count)
      order by coalesce(scheduled_at, created_at) desc), '[]'::jsonb)
  ) into v
  from broadcasts
  where account_id = p_cuenta
    and coalesce(scheduled_at, created_at) >= p_desde
    and coalesce(scheduled_at, created_at) < p_hasta
    and status in ('sending', 'sent', 'failed');

  return v;
end;
$$;

revoke all on function public.informe_general(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.informe_general(uuid, timestamptz, timestamptz, text) to authenticated;
