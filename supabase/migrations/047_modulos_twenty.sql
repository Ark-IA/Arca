-- ============================================================
-- Módulos traídos de Twenty CRM
-- ============================================================
--
-- Arca nació como bandeja de WhatsApp con embudo de ventas. Le falta lo que
-- convierte una bandeja en un CRM: la empresa como entidad propia, tareas con
-- responsable, notas y adjuntos que se puedan colgar de cualquier cosa, una
-- línea de tiempo de lo que pasó, agenda, y una lista de a quién no escribir.
--
-- Esta migración trae siete módulos:
--
--   companies         empresas como entidad, no un texto suelto en el contacto
--   notes             notas genéricas, adjuntables a persona / empresa / negocio
--   tasks             tareas con responsable, vencimiento y estado
--   attachments       archivos colgados de cualquier registro
--   timeline_events   qué pasó y cuándo, por registro
--   calendar_events   reuniones y llamadas agendadas
--   blocklist         a quién no se le escribe nunca
--
--
-- EL PATRÓN DE VÍNCULO
--
-- Twenty resuelve "esta nota pertenece a X" con una tabla puente y una columna
-- nullable por cada tipo de destino, más una restricción de que exactamente
-- una esté puesta. Parece más aparatoso que una pareja (tipo, id), pero esa
-- pareja no la puede verificar la base: nada impide guardar
-- ('contact', <id de una empresa>), y el día que se borre la empresa la fila
-- queda apuntando al vacío para siempre.
--
-- Con una columna por tipo, cada una es una clave foránea de verdad: el borrado
-- en cascada funciona y no puede existir un vínculo huérfano.
--
-- Notas y tareas usan tabla puente porque una misma nota puede colgar de la
-- persona Y de su empresa. Adjuntos, eventos de línea de tiempo y del
-- calendario llevan las columnas directamente: cada uno pertenece a un solo
-- registro y una tabla puente sería ceremonia sin ganancia.


-- ============================================================
-- 1. EMPRESAS
-- ============================================================
--
-- `contacts.company` es hoy texto libre. Eso significa que "Acme", "ACME S.A."
-- y "acme" son tres empresas distintas para el CRM, no se pueden listar los
-- contactos de una, ni ver cuánto se le vendió. La columna vieja NO se borra:
-- se conserva como lo que la persona escribió, y se agrega el vínculo real.

create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  -- Quién la creó. Para auditoría; el acceso lo decide account_id.
  user_id     uuid references auth.users(id) on delete set null,

  name        text not null check (length(trim(name)) > 0),
  domain      text,
  phone       text,
  address     text,
  city        text,
  country     text,
  industry    text,
  -- Cantidad de empleados: un dato que se usa para segmentar, no para sumar.
  employees   integer check (employees is null or employees >= 0),
  -- Facturación anual declarada, en la moneda de la cuenta.
  annual_revenue numeric(14, 2) check (annual_revenue is null or annual_revenue >= 0),
  linkedin_url text,
  notes       text,
  -- Marcada como cliente ideal. Twenty lo llama ICP y es el filtro que más se
  -- usa al priorizar a quién llamar primero.
  is_ideal_customer boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_companies_account on companies (account_id, name);
-- El dominio identifica una empresa mejor que su nombre: "Acme" hay muchas,
-- acme.com hay una. Único por cuenta para que no se dupliquen al importar.
create unique index if not exists idx_companies_dominio
  on companies (account_id, lower(domain)) where domain is not null and domain <> '';

alter table companies enable row level security;

drop policy if exists companies_select on companies;
create policy companies_select on companies
  for select using (is_account_member(account_id, 'viewer'));
drop policy if exists companies_insert on companies;
create policy companies_insert on companies
  for insert with check (is_account_member(account_id, 'agent'));
drop policy if exists companies_update on companies;
create policy companies_update on companies
  for update using (is_account_member(account_id, 'agent'));
drop policy if exists companies_delete on companies;
create policy companies_delete on companies
  for delete using (is_account_member(account_id, 'admin'));

grant all on companies to anon, authenticated, service_role;

-- El vínculo desde el contacto. `on delete set null`: borrar una empresa no
-- puede llevarse por delante a sus contactos -- son personas, siguen
-- existiendo aunque cambien de trabajo.
alter table contacts add column if not exists company_id uuid
  references companies(id) on delete set null;
create index if not exists idx_contacts_company on contacts (company_id)
  where company_id is not null;

-- El cargo de la persona en esa empresa. Va en el contacto y no en la
-- empresa porque es de la relación, no de ninguno de los dos.
alter table contacts add column if not exists job_title text;

comment on column contacts.company is
  'Nombre de empresa como texto libre, anterior a la tabla companies. Se conserva '
  'para no perder lo que ya estaba escrito; el vínculo real es company_id.';


-- ============================================================
-- 2. NOTAS GENÉRICAS
-- ============================================================
--
-- Ya existe `contact_notes`, atada a un contacto y a su autor. Esta reemplaza
-- ese modelo sin borrarlo: notas con título, cuerpo y varios destinos.

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,

  title       text,
  body        text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_notes_account on notes (account_id, created_at desc);

create table if not exists note_targets (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references notes(id) on delete cascade,
  contact_id uuid references contacts(id)  on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  deal_id    uuid references deals(id)     on delete cascade,
  created_at timestamptz not null default now(),
  -- Exactamente uno. Ninguno sería una nota colgada de la nada; más de uno
  -- haría ambiguo a qué ficha pertenece la fila.
  constraint note_targets_un_destino
    check (num_nonnulls(contact_id, company_id, deal_id) = 1)
);

create index if not exists idx_note_targets_note    on note_targets (note_id);
create index if not exists idx_note_targets_contact on note_targets (contact_id) where contact_id is not null;
create index if not exists idx_note_targets_company on note_targets (company_id) where company_id is not null;
create index if not exists idx_note_targets_deal    on note_targets (deal_id)    where deal_id is not null;

alter table notes enable row level security;
alter table note_targets enable row level security;

drop policy if exists notes_select on notes;
create policy notes_select on notes for select using (is_account_member(account_id, 'viewer'));
drop policy if exists notes_insert on notes;
create policy notes_insert on notes for insert with check (is_account_member(account_id, 'agent'));
drop policy if exists notes_update on notes;
create policy notes_update on notes for update using (is_account_member(account_id, 'agent'));
drop policy if exists notes_delete on notes;
create policy notes_delete on notes for delete using (is_account_member(account_id, 'agent'));

-- El vínculo hereda el permiso de su nota. Comprobar la pertenencia por la
-- nota y no repetir account_id en la puente evita que las dos se puedan
-- contradecir.
drop policy if exists note_targets_all on note_targets;
create policy note_targets_all on note_targets
  for all using (
    exists (select 1 from notes n where n.id = note_targets.note_id
              and is_account_member(n.account_id, 'viewer'))
  )
  with check (
    exists (select 1 from notes n where n.id = note_targets.note_id
              and is_account_member(n.account_id, 'agent'))
  );

grant all on notes        to anon, authenticated, service_role;
grant all on note_targets to anon, authenticated, service_role;


-- ============================================================
-- 3. TAREAS
-- ============================================================

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  -- Quién la creó.
  user_id     uuid references auth.users(id) on delete set null,
  -- Quién la tiene que hacer. Nullable: una tarea sin dueño es una tarea de
  -- la cola común, y es un estado legítimo, no un error.
  assignee_id uuid references auth.users(id) on delete set null,

  title       text not null check (length(trim(title)) > 0),
  body        text,

  status      text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'canceled')),
  -- Tres niveles y no cinco: con cinco, todo el mundo usa dos.
  priority    text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),

  due_at      timestamptz,
  completed_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- "Mis tareas pendientes por vencimiento" es la consulta que se hace todo el
-- día; este índice es el que la sostiene.
create index if not exists idx_tasks_asignado
  on tasks (account_id, assignee_id, status, due_at);
create index if not exists idx_tasks_vencimiento
  on tasks (account_id, due_at) where status in ('todo', 'in_progress');

create table if not exists task_targets (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  contact_id uuid references contacts(id)  on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  deal_id    uuid references deals(id)     on delete cascade,
  created_at timestamptz not null default now(),
  constraint task_targets_un_destino
    check (num_nonnulls(contact_id, company_id, deal_id) = 1)
);

create index if not exists idx_task_targets_task    on task_targets (task_id);
create index if not exists idx_task_targets_contact on task_targets (contact_id) where contact_id is not null;
create index if not exists idx_task_targets_company on task_targets (company_id) where company_id is not null;
create index if not exists idx_task_targets_deal    on task_targets (deal_id)    where deal_id is not null;

alter table tasks enable row level security;
alter table task_targets enable row level security;

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select using (is_account_member(account_id, 'viewer'));
drop policy if exists tasks_insert on tasks;
create policy tasks_insert on tasks for insert with check (is_account_member(account_id, 'agent'));
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (is_account_member(account_id, 'agent'));
drop policy if exists tasks_delete on tasks;
create policy tasks_delete on tasks for delete using (is_account_member(account_id, 'agent'));

drop policy if exists task_targets_all on task_targets;
create policy task_targets_all on task_targets
  for all using (
    exists (select 1 from tasks t where t.id = task_targets.task_id
              and is_account_member(t.account_id, 'viewer'))
  )
  with check (
    exists (select 1 from tasks t where t.id = task_targets.task_id
              and is_account_member(t.account_id, 'agent'))
  );

grant all on tasks        to anon, authenticated, service_role;
grant all on task_targets to anon, authenticated, service_role;

-- `completed_at` se pone y se quita sola al cambiar de estado. Dejarlo a cargo
-- de quien actualiza garantiza que tarde o temprano haya tareas marcadas como
-- hechas sin fecha, o con fecha y vueltas a pendiente.
create or replace function public.tasks_marcar_completada()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tasks_completada on tasks;
create trigger trg_tasks_completada
  before insert or update on tasks
  for each row execute function public.tasks_marcar_completada();


-- ============================================================
-- 4. ADJUNTOS
-- ============================================================
--
-- El archivo vive en el almacenamiento de Supabase; acá solo queda su
-- dirección y sus datos. Guardar el binario en la base haría que cada copia de
-- seguridad pesara lo que pesan todos los archivos juntos.

create table if not exists attachments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,

  name        text not null,
  url         text not null,
  mime_type   text,
  size_bytes  bigint check (size_bytes is null or size_bytes >= 0),

  contact_id  uuid references contacts(id)  on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  deal_id     uuid references deals(id)     on delete cascade,

  created_at  timestamptz not null default now(),
  constraint attachments_un_destino
    check (num_nonnulls(contact_id, company_id, deal_id) = 1)
);

create index if not exists idx_attachments_contact on attachments (contact_id) where contact_id is not null;
create index if not exists idx_attachments_company on attachments (company_id) where company_id is not null;
create index if not exists idx_attachments_deal    on attachments (deal_id)    where deal_id is not null;

alter table attachments enable row level security;

drop policy if exists attachments_select on attachments;
create policy attachments_select on attachments for select using (is_account_member(account_id, 'viewer'));
drop policy if exists attachments_insert on attachments;
create policy attachments_insert on attachments for insert with check (is_account_member(account_id, 'agent'));
drop policy if exists attachments_update on attachments;
create policy attachments_update on attachments for update using (is_account_member(account_id, 'agent'));
drop policy if exists attachments_delete on attachments;
create policy attachments_delete on attachments for delete using (is_account_member(account_id, 'agent'));

grant all on attachments to anon, authenticated, service_role;


-- ============================================================
-- 5. LÍNEA DE TIEMPO
-- ============================================================
--
-- Qué le pasó a este registro y cuándo. La escribe el sistema, no la persona:
-- por eso no hay política de escritura para `authenticated` y solo entra por
-- la clave de servicio. Una línea de tiempo que se puede editar desde el
-- cliente no sirve como registro de nada.

create table if not exists timeline_events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  -- Quién lo provocó. Null cuando fue el sistema (un webhook, una automatización).
  user_id     uuid references auth.users(id) on delete set null,

  -- Qué pasó. Texto y no enumeración: cada módulo nuevo trae verbos nuevos, y
  -- una restricción acá obligaría a migrar la base para registrar un evento.
  event_type  text not null,
  title       text not null,
  description text,
  -- Datos propios del evento (importe del negocio, canal del mensaje...).
  metadata    jsonb not null default '{}'::jsonb,

  contact_id  uuid references contacts(id)  on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  deal_id     uuid references deals(id)     on delete cascade,

  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint timeline_un_destino
    check (num_nonnulls(contact_id, company_id, deal_id) = 1)
);

create index if not exists idx_timeline_contact on timeline_events (contact_id, occurred_at desc) where contact_id is not null;
create index if not exists idx_timeline_company on timeline_events (company_id, occurred_at desc) where company_id is not null;
create index if not exists idx_timeline_deal    on timeline_events (deal_id,    occurred_at desc) where deal_id is not null;
create index if not exists idx_timeline_cuenta  on timeline_events (account_id, occurred_at desc);

alter table timeline_events enable row level security;

drop policy if exists timeline_select on timeline_events;
create policy timeline_select on timeline_events
  for select using (is_account_member(account_id, 'viewer'));

-- Sin políticas de insert/update/delete a propósito: RLS deniega por defecto,
-- así que `authenticated` puede leer la línea de tiempo y no puede tocarla.
-- La escribe el servidor con la clave de servicio, que se salta RLS.

grant select on timeline_events to anon, authenticated;
grant all    on timeline_events to service_role;


-- ============================================================
-- 6. CALENDARIO
-- ============================================================

create table if not exists calendar_events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,

  title       text not null check (length(trim(title)) > 0),
  description text,
  location    text,
  -- Enlace de videollamada, si la reunión es remota.
  meeting_url text,

  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_all_day  boolean not null default false,

  status      text not null default 'confirmed'
    check (status in ('confirmed', 'tentative', 'canceled')),

  contact_id  uuid references contacts(id)  on delete set null,
  company_id  uuid references companies(id) on delete set null,
  deal_id     uuid references deals(id)     on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Una reunión que termina antes de empezar no es un caso raro que haya que
  -- tolerar: es un error de quien la cargó, y detectarlo acá evita que la
  -- agenda muestre bloques de duración negativa.
  constraint calendar_orden_de_horas check (ends_at >= starts_at)
);

-- La agenda siempre se consulta por rango de fechas.
create index if not exists idx_calendar_rango on calendar_events (account_id, starts_at);
create index if not exists idx_calendar_contact on calendar_events (contact_id) where contact_id is not null;

alter table calendar_events enable row level security;

drop policy if exists calendar_select on calendar_events;
create policy calendar_select on calendar_events for select using (is_account_member(account_id, 'viewer'));
drop policy if exists calendar_insert on calendar_events;
create policy calendar_insert on calendar_events for insert with check (is_account_member(account_id, 'agent'));
drop policy if exists calendar_update on calendar_events;
create policy calendar_update on calendar_events for update using (is_account_member(account_id, 'agent'));
drop policy if exists calendar_delete on calendar_events;
create policy calendar_delete on calendar_events for delete using (is_account_member(account_id, 'agent'));

grant all on calendar_events to anon, authenticated, service_role;

-- Quién va a la reunión. Tabla aparte porque son varios por evento.
create table if not exists calendar_event_participants (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references calendar_events(id) on delete cascade,
  -- Un participante es una persona del equipo o un contacto, no las dos.
  member_id  uuid references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id)   on delete cascade,
  response   text not null default 'pending'
    check (response in ('pending', 'accepted', 'declined')),
  constraint participante_uno_u_otro check (num_nonnulls(member_id, contact_id) = 1)
);

create index if not exists idx_participantes_evento on calendar_event_participants (event_id);
-- Nadie dos veces en la misma reunión.
create unique index if not exists idx_participante_unico_miembro
  on calendar_event_participants (event_id, member_id) where member_id is not null;
create unique index if not exists idx_participante_unico_contacto
  on calendar_event_participants (event_id, contact_id) where contact_id is not null;

alter table calendar_event_participants enable row level security;

drop policy if exists participantes_all on calendar_event_participants;
create policy participantes_all on calendar_event_participants
  for all using (
    exists (select 1 from calendar_events e where e.id = calendar_event_participants.event_id
              and is_account_member(e.account_id, 'viewer'))
  )
  with check (
    exists (select 1 from calendar_events e where e.id = calendar_event_participants.event_id
              and is_account_member(e.account_id, 'agent'))
  );

grant all on calendar_event_participants to anon, authenticated, service_role;


-- ============================================================
-- 7. LISTA DE BLOQUEO
-- ============================================================
--
-- A quién no se le escribe nunca. Twenty la usa para que la sincronización de
-- correo ignore ciertas direcciones; acá el uso real es más serio: alguien que
-- pidió no recibir más mensajes, y volver a escribirle es un problema legal,
-- no una molestia.
--
-- Por eso el filtro tiene que estar en el envío y en el masivo, no solo en la
-- interfaz.

create table if not exists blocklist (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  -- Quién lo bloqueó. Importa: ante un reclamo hay que poder decir quién y cuándo.
  user_id     uuid references auth.users(id) on delete set null,

  -- Qué se bloquea: un teléfono, un identificador de usuario de WhatsApp, un
  -- correo o un dominio entero.
  kind        text not null default 'phone'
    check (kind in ('phone', 'whatsapp_user', 'email', 'domain')),
  -- Ya normalizado por quien lo escribe (teléfono en E.164, correo en minúsculas).
  value       text not null check (length(trim(value)) > 0),
  reason      text,

  created_at  timestamptz not null default now()
);

-- Un mismo valor no se bloquea dos veces. Comparación insensible a mayúsculas
-- porque los correos y dominios no las distinguen.
create unique index if not exists idx_blocklist_unico
  on blocklist (account_id, kind, lower(value));

alter table blocklist enable row level security;

drop policy if exists blocklist_select on blocklist;
create policy blocklist_select on blocklist for select using (is_account_member(account_id, 'viewer'));
drop policy if exists blocklist_insert on blocklist;
create policy blocklist_insert on blocklist for insert with check (is_account_member(account_id, 'agent'));
drop policy if exists blocklist_delete on blocklist;
create policy blocklist_delete on blocklist for delete using (is_account_member(account_id, 'admin'));

grant all on blocklist to anon, authenticated, service_role;


-- ============================================================
-- MANTENIMIENTO DE updated_at
-- ============================================================
--
-- Una sola función para todas: la fecha de modificación la lleva la base. Si
-- dependiera de que cada ruta acuerde de mandarla, la primera que se olvide
-- deja filas que dicen no haber cambiado nunca.

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated on companies;
create trigger trg_companies_updated before update on companies
  for each row execute function public.tocar_updated_at();

drop trigger if exists trg_notes_updated on notes;
create trigger trg_notes_updated before update on notes
  for each row execute function public.tocar_updated_at();

drop trigger if exists trg_calendar_updated on calendar_events;
create trigger trg_calendar_updated before update on calendar_events
  for each row execute function public.tocar_updated_at();
-- tasks ya tiene el suyo (trg_tasks_completada), que también toca updated_at.


-- ============================================================
-- ARRASTRE DE LAS EMPRESAS QUE YA ESTABAN ESCRITAS
-- ============================================================
--
-- Cada nombre distinto que haya en `contacts.company` se convierte en una
-- empresa, y los contactos quedan vinculados. Se agrupa por nombre en
-- minúsculas y sin espacios sobrantes: "Acme ", "acme" y "ACME" son la misma.

insert into companies (account_id, name)
select distinct on (c.account_id, lower(trim(c.company)))
       c.account_id, trim(c.company)
from contacts c
where c.company is not null
  and trim(c.company) <> ''
  and c.account_id is not null
on conflict do nothing;

update contacts c
set company_id = e.id
from companies e
where c.company_id is null
  and c.company is not null
  and trim(c.company) <> ''
  and e.account_id = c.account_id
  and lower(e.name) = lower(trim(c.company));


-- ============================================================
-- PERMISOS POR DEFECTO
-- ============================================================
--
-- Las políticas RLS se evalúan DESPUÉS de los permisos de tabla: sin este
-- bloque, una tabla nueva da "permission denied" antes de llegar a mirar
-- ninguna política. Ya pasó dos veces en este despliegue.

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
