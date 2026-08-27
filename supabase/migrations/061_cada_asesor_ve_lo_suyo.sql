-- ============================================================
-- Cada asesor ve solo lo suyo
-- ============================================================
--
-- Hasta ahora la unidad de aislamiento era la CUENTA: cualquier miembro veía
-- todas las conversaciones, contactos y negocios de su organización. Eso vale
-- para un equipo de tres personas que se conocen; deja de valer en cuanto hay
-- turnos, y ahí la pregunta «¿esto es mío o de mi compañero?» la tiene que
-- responder el sistema, no la memoria de cada uno.
--
-- La unidad pasa a ser la ASIGNACIÓN:
--
--   administración          ve toda la cuenta
--   asesor y observador     ven lo que se les asignó, y lo que espera en una
--                           de sus colas
--
-- Sin asignación y sin cola, un asesor no ve nada. Es lo pedido, y tiene una
-- consecuencia que conviene decir en voz alta: una conversación nueva que
-- ningún flujo derive y nadie asigne queda invisible para todos los asesores.
-- La forma de que el trabajo llegue es que el flujo la mande a una cola, o
-- que un administrador la reparta. Administración las sigue viendo todas, así
-- que nada se pierde, pero alguien tiene que estar mirando.

-- ------------------------------------------------------------
-- 1. Las dos preguntas, en un solo sitio
-- ------------------------------------------------------------
--
-- Van como funciones y no repetidas en cada política por dos motivos: que la
-- respuesta sea UNA (ocho copias de la misma condición se separan al primer
-- cambio que alguien haga en siete), y que sean SECURITY DEFINER, para que
-- consultar `cola_miembros` desde dentro de una política no vuelva a
-- disparar las políticas de esa tabla.

create or replace function public.mis_colas()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.cola_id from cola_miembros m where m.user_id = auth.uid()
$$;

alter function public.mis_colas() owner to postgres;
grant execute on function public.mis_colas() to authenticated, service_role;

comment on function public.mis_colas() is
  'Las colas que atiende quien pregunta. SECURITY DEFINER para que usarla '
  'dentro de una política no reevalúe las políticas de cola_miembros.';

create or replace function public.conversacion_visible(p_conversacion uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from conversations c
    where c.id = p_conversacion
      and is_account_member(c.account_id)
      and (
        is_account_member(c.account_id, 'admin')
        or c.assigned_agent_id = auth.uid()
        or (c.cola_id is not null and c.cola_id in (select public.mis_colas()))
      )
  )
$$;

alter function public.conversacion_visible(uuid) owner to postgres;
grant execute on function public.conversacion_visible(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Conversaciones
-- ------------------------------------------------------------
--
-- La condición va escrita aquí y no llamando a `conversacion_visible`: la
-- función existe para que OTRAS tablas hereden esta regla, y usarla sobre la
-- propia tabla obligaría a un subconsulta por fila para responder algo que
-- ya está a la vista.

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations
  for select using (
    is_account_member(account_id)
    and (
      is_account_member(account_id, 'admin')
      or assigned_agent_id = auth.uid()
      or (cola_id is not null and cola_id in (select public.mis_colas()))
    )
  );

-- Escribir sobre una conversación que no se puede ver no tiene sentido: sin
-- esto, un asesor podría tomar para sí una conversación cuyo contenido no
-- llega a leer, adivinando su identificador.
drop policy if exists conversations_update on conversations;
create policy conversations_update on conversations
  for update using (
    is_account_member(account_id, 'agent')
    and (
      is_account_member(account_id, 'admin')
      or assigned_agent_id = auth.uid()
      or (cola_id is not null and cola_id in (select public.mis_colas()))
      -- Tomar una conversación que está en la cola de uno y todavía no tiene
      -- dueño es justo el gesto que se espera de un asesor.
      or (assigned_agent_id is null and cola_id is not null
          and cola_id in (select public.mis_colas()))
    )
  );

-- ------------------------------------------------------------
-- 3. Mensajes
-- ------------------------------------------------------------
--
-- Heredan de su conversación. Dejarlos con permiso de cuenta sería dejar la
-- puerta principal cerrada y la ventana abierta: el contenido de la
-- conversación está en los mensajes, no en su fila de cabecera.

drop policy if exists messages_select on messages;
create policy messages_select on messages
  for select using (public.conversacion_visible(conversation_id));

drop policy if exists messages_modify on messages;
create policy messages_modify on messages
  for all using (
    public.conversacion_visible(conversation_id)
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and is_account_member(c.account_id, 'agent')
    )
  );

-- ------------------------------------------------------------
-- 4. Contactos
-- ------------------------------------------------------------
--
-- Un contacto es de quien lo creó o de quien atiende su conversación. La
-- segunda mitad no es adorno: sin ella, el asesor vería la conversación y no
-- el nombre de la persona con la que habla.

create or replace function public.contacto_visible(p_contacto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations c
    where c.contact_id = p_contacto
      and (
        c.assigned_agent_id = auth.uid()
        or (c.cola_id is not null and c.cola_id in (select public.mis_colas()))
      )
  )
$$;

alter function public.contacto_visible(uuid) owner to postgres;
grant execute on function public.contacto_visible(uuid) to authenticated, service_role;

drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts
  for select using (
    is_account_member(account_id)
    and (
      is_account_member(account_id, 'admin')
      or user_id = auth.uid()
      or public.contacto_visible(id)
    )
  );

drop policy if exists contact_notes_select on contact_notes;
create policy contact_notes_select on contact_notes
  for select using (
    is_account_member(account_id)
    and (
      is_account_member(account_id, 'admin')
      or user_id = auth.uid()
      or public.contacto_visible(contact_id)
    )
  );

-- ------------------------------------------------------------
-- 5. Negocios y tareas
-- ------------------------------------------------------------

drop policy if exists deals_select on deals;
create policy deals_select on deals
  for select using (
    is_account_member(account_id)
    and (
      is_account_member(account_id, 'admin')
      or assigned_to = auth.uid()
      or user_id = auth.uid()
      -- Un negocio nacido de una conversación que uno atiende es suyo aunque
      -- lo haya creado una automatización a nombre del dueño de la cuenta.
      or (contact_id is not null and public.contacto_visible(contact_id))
    )
  );

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks
  for select using (
    is_account_member(account_id, 'viewer')
    and (
      is_account_member(account_id, 'admin')
      or user_id = auth.uid()
      or assignee_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 6. Registro de llamadas
-- ------------------------------------------------------------
--
-- Leer las llamadas ajenas era de cualquier miembro. Se alinea: las propias,
-- o todas si administra.

drop policy if exists call_logs_select on call_logs;
create policy call_logs_select on call_logs
  for select using (
    is_account_member(account_id)
    and (is_account_member(account_id, 'admin') or user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 7. Lo que NO se toca, y por qué
-- ------------------------------------------------------------
--
-- `companies` sigue siendo de toda la cuenta. Una empresa es dato de
-- referencia compartido, no trabajo asignable: esconderla dejaría la ficha
-- de un contacto que sí se puede ver con el nombre de la empresa en blanco,
-- y no protege nada que no proteja ya la política de contactos.
--
-- El motor de flujos, las automatizaciones y el agente de IA corren con la
-- clave de servicio, que no pasa por RLS. Siguen atendiendo todas las
-- conversaciones: si dependieran de estas políticas, un flujo dejaría de
-- responderle a un cliente por no estar asignado a nadie.

-- ------------------------------------------------------------
-- 8. Índices para las preguntas nuevas
-- ------------------------------------------------------------
--
-- Cada lectura de la bandeja pasa ahora por «¿asignada a mí?» y «¿en una de
-- mis colas?». Sin índice eso es un recorrido completo de la tabla en cada
-- carga, y se nota en cuanto hay volumen.

create index if not exists conversations_asignadas
  on conversations (assigned_agent_id) where assigned_agent_id is not null;

create index if not exists conversations_por_contacto
  on conversations (contact_id) where contact_id is not null;
