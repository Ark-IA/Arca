-- ============================================================
-- Colas de asesores
-- ============================================================
--
-- Hasta ahora una conversación solo podía entregarse a UNA persona concreta.
-- Eso obliga a que quien arma el flujo sepa de antemano quién va a estar
-- disponible, y el día que esa persona se va de vacaciones el flujo sigue
-- mandándole conversaciones a un buzón que nadie mira.
--
-- Una cola es un destino con nombre — Ventas, Soporte — y una lista de
-- personas que la atienden. El flujo dice «a Ventas» y deja de importar
-- quién esté ese día: eso se resuelve en Configuración, donde corresponde,
-- y sin tocar ningún flujo.

-- ------------------------------------------------------------
-- 1. Las colas
-- ------------------------------------------------------------

create table if not exists colas (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  description text,
  -- Un color para distinguirlas de un vistazo en la bandeja. Se guarda el
  -- nombre del color y no el código: así el tema oscuro y el claro pueden
  -- elegir tonos distintos sin migrar datos.
  color text not null default 'slate',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint colas_name_no_vacio check (length(trim(name)) > 0),
  constraint colas_color_valido check (
    color in ('slate','blue','emerald','amber','violet','rose','cyan')
  )
);

-- Dos colas llamadas «Ventas» en la misma cuenta serían indistinguibles en
-- todos los selectores del producto. Sin distinguir mayúsculas, porque
-- «Ventas» y «ventas» son la misma cola para cualquiera que las lea.
create unique index if not exists colas_nombre_unico_por_cuenta
  on colas (account_id, lower(trim(name)));

create index if not exists colas_por_cuenta on colas (account_id) where is_active;

-- ------------------------------------------------------------
-- 2. Quién atiende cada cola
-- ------------------------------------------------------------

create table if not exists cola_miembros (
  cola_id uuid not null references colas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cola_id, user_id)
);

-- La consulta caliente es «¿en qué colas estoy?», para pintarle a cada
-- asesor lo que le toca. Va por usuario, no por cola.
create index if not exists cola_miembros_por_usuario on cola_miembros (user_id);

-- ------------------------------------------------------------
-- 3. En qué cola espera cada conversación
-- ------------------------------------------------------------

alter table conversations
  add column if not exists cola_id uuid references colas(id) on delete set null;

-- `on delete set null` y no cascade: borrar una cola no puede llevarse por
-- delante las conversaciones que esperaban en ella. Quedan sin cola, que es
-- recuperable; borradas, no.

create index if not exists conversations_por_cola
  on conversations (cola_id) where cola_id is not null;

comment on column conversations.cola_id is
  'Cola en la que espera esta conversación, cuando un flujo o una '
  'automatización la enviaron a una en vez de a una persona concreta.';

-- ------------------------------------------------------------
-- 4. Permisos
-- ------------------------------------------------------------
--
-- Leer las colas lo puede hacer cualquier miembro: un asesor necesita ver el
-- nombre de la cola en la conversación que está atendiendo. Crearlas y
-- repartir gente es de administración.

alter table colas enable row level security;
alter table cola_miembros enable row level security;

drop policy if exists colas_select on colas;
create policy colas_select on colas
  for select using (is_account_member(account_id));

drop policy if exists colas_insert on colas;
create policy colas_insert on colas
  for insert with check (is_account_member(account_id, 'admin'));

drop policy if exists colas_update on colas;
create policy colas_update on colas
  for update using (is_account_member(account_id, 'admin'));

drop policy if exists colas_delete on colas;
create policy colas_delete on colas
  for delete using (is_account_member(account_id, 'admin'));

-- La pertenencia se comprueba subiendo a la cola y de ahí a la cuenta. No
-- hay `account_id` en esta tabla a propósito: duplicarlo permitiría que se
-- desincronizara del de la cola, y entonces habría dos respuestas distintas
-- a «¿de quién es esta fila?».
drop policy if exists cola_miembros_select on cola_miembros;
create policy cola_miembros_select on cola_miembros
  for select using (
    exists (select 1 from colas c
            where c.id = cola_miembros.cola_id and is_account_member(c.account_id))
  );

drop policy if exists cola_miembros_write on cola_miembros;
create policy cola_miembros_write on cola_miembros
  for all using (
    exists (select 1 from colas c
            where c.id = cola_miembros.cola_id and is_account_member(c.account_id, 'admin'))
  ) with check (
    exists (select 1 from colas c
            where c.id = cola_miembros.cola_id and is_account_member(c.account_id, 'admin'))
  );

-- Los GRANT se evalúan ANTES que las políticas: sin esto, RLS no llega a
-- ejecutarse nunca y todo devuelve «permiso denegado» sin explicar por qué.
grant select, insert, update, delete on colas to authenticated;
grant select, insert, update, delete on cola_miembros to authenticated;
grant all on colas to service_role;
grant all on cola_miembros to service_role;

-- ------------------------------------------------------------
-- 5. Dos colas para empezar
-- ------------------------------------------------------------
--
-- Una lista vacía obliga a inventar antes de entender. Con Ventas y Soporte
-- ya creadas, el selector del flujo muestra algo desde el primer momento y
-- se ve para qué sirve; renombrarlas o borrarlas es un clic.

do $$
declare
  v_cuenta uuid;
  v_dueno  uuid;
  v_ventas uuid;
  v_soporte uuid;
begin
  select a.id, a.owner_user_id into v_cuenta, v_dueno
  from accounts a order by a.created_at limit 1;
  if v_cuenta is null then return; end if;

  insert into colas (account_id, name, description, color)
  values (v_cuenta, 'Ventas', 'Consultas comerciales, precios y propuestas.', 'emerald')
  on conflict do nothing;

  insert into colas (account_id, name, description, color)
  values (v_cuenta, 'Soporte', 'Clientes con un problema o una consulta técnica.', 'blue')
  on conflict do nothing;

  select id into v_ventas from colas where account_id = v_cuenta and name = 'Ventas';
  select id into v_soporte from colas where account_id = v_cuenta and name = 'Soporte';

  -- El dueño entra en las dos: una cola sin nadie no le llega a nadie, y
  -- dejarlas vacías sería repetir el problema que vinieron a resolver.
  if v_dueno is not null then
    insert into cola_miembros (cola_id, user_id) values (v_ventas, v_dueno)
    on conflict do nothing;
    insert into cola_miembros (cola_id, user_id) values (v_soporte, v_dueno)
    on conflict do nothing;
  end if;
end $$;
