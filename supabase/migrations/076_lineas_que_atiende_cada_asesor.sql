-- ============================================================
-- Qué líneas atiende cada asesor
-- ============================================================
--
-- Una plataforma omnicanal puede tener líneas sin límite: varios números
-- de WhatsApp, varias páginas, varias cuentas de Instagram. Y no todo el
-- mundo atiende todo — uno lleva una sola línea, otro lleva cinco.
--
-- Esto NO es un filtro de comodidad. Si un asesor solo atiende la línea de
-- ventas, no puede VER lo que entra por soporte: ni las conversaciones, ni
-- los mensajes, ni los contactos que solo hablaron por ahí. Se resuelve en
-- la base y no en la pantalla, porque un filtro de interfaz lo esquiva
-- cualquiera que sepa escribir una dirección.
--
-- ------------------------------------------------------------
-- ATENCIÓN: esto MODIFICA una política que comparte crm.ark-ia.com
-- ------------------------------------------------------------
-- Es la única forma de restringir: las políticas de Postgres se SUMAN
-- (OR), así que agregar una nueva solo puede ampliar el acceso, nunca
-- recortarlo. Para recortar hay que tocar la que existe.
--
-- La seguridad está en la guarda: `atiende_la_linea` responde SIEMPRE que
-- sí cuando la persona no tiene ninguna línea asignada. Nadie del CRM va a
-- tener filas en esta tabla, así que para el CRM la condición nueva es
-- constante-verdadera y su comportamiento no cambia en nada. Se comprueba
-- después, con sus propios usuarios, y no se da por hecho.

create table if not exists asesor_lineas (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references channel_connections(id) on delete cascade,
  created_at    timestamptz not null default now(),

  unique (user_id, connection_id)
);

create index if not exists asesor_lineas_por_usuario on asesor_lineas (user_id);
create index if not exists asesor_lineas_por_cuenta  on asesor_lineas (account_id);

alter table asesor_lineas enable row level security;

-- Cada quien ve sus asignaciones; quien administra, las de todo el equipo.
drop policy if exists asesor_lineas_select on asesor_lineas;
create policy asesor_lineas_select on asesor_lineas
  for select using (
    is_account_member(account_id)
    and (user_id = auth.uid() or is_account_member(account_id, 'admin'))
  );

-- Escribir: solo administración, y por la API. Si un asesor pudiera
-- asignarse líneas, el aislamiento no aislaría nada.
revoke all on asesor_lineas from anon, authenticated;
grant select on asesor_lineas to authenticated;

-- ------------------------------------------------------------
-- ¿Le toca esta línea?
-- ------------------------------------------------------------
create or replace function public.atiende_la_linea(p_cuenta uuid, p_conexion uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Quien administra ve todas las líneas. Es su trabajo: reparte,
    -- supervisa y responde por lo que no se atendió.
    when is_account_member(p_cuenta, 'admin') then true

    -- Sin asignaciones, se ve todo. Es el comportamiento de siempre, y es
    -- lo que hace que esta migración no cambie nada para quien no use la
    -- función. Al revés —sin asignaciones no ve nada— un despiste al dar
    -- de alta a alguien lo dejaría mirando una bandeja vacía sin entender
    -- por qué.
    when not exists (
      select 1 from asesor_lineas a where a.user_id = auth.uid()
    ) then true

    -- Una conversación sin línea anotada es anterior a las conexiones
    -- múltiples. Esconderla sería ocultar historia que nadie decidió
    -- ocultar.
    when p_conexion is null then true

    else exists (
      select 1 from asesor_lineas a
      where a.user_id = auth.uid()
        and a.connection_id = p_conexion
    )
  end;
$$;

alter function public.atiende_la_linea(uuid, uuid) owner to postgres;
grant execute on function public.atiende_la_linea(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- Un solo punto de cambio
-- ------------------------------------------------------------
-- Los mensajes y los contactos no se tocan: sus políticas ya cuelgan de la
-- visibilidad de la conversación (migración 061). Añadiendo la línea acá y
-- en `conversacion_visible`, todo lo demás la hereda sin escribir una
-- condición más.

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations
  for select using (
    is_account_member(account_id)
    and (
      is_account_member(account_id, 'admin')
      or assigned_agent_id = auth.uid()
      or (cola_id is not null and cola_id in (select public.mis_colas()))
    )
    and public.atiende_la_linea(account_id, connection_id)
  );

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
      and public.atiende_la_linea(c.account_id, c.connection_id)
  )
$$;

alter function public.conversacion_visible(uuid) owner to postgres;
grant execute on function public.conversacion_visible(uuid) to authenticated, service_role;

-- Y el contacto, por el mismo camino: se ve si se ve alguna conversación
-- suya. Sin esta línea, un asesor vería el nombre de gente con la que
-- nunca podrá hablar.
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
      and public.atiende_la_linea(c.account_id, c.connection_id)
  )
$$;

alter function public.contacto_visible(uuid) owner to postgres;
grant execute on function public.contacto_visible(uuid) to authenticated, service_role;
