-- ============================================================
-- Telefonia: extension SIP por usuario y registro de llamadas
-- ============================================================
--
-- Cada usuario del CRM puede tener una extension de Asterisk. La extension
-- vive en `profiles` y no en una tabla aparte porque es un atributo del
-- usuario, no una entidad con vida propia: no se comparte, no se hereda y
-- muere con el perfil.
--
-- La unicidad es POR CUENTA, no global: dos organizaciones distintas pueden
-- usar la 1001 sin pisarse, igual que dos empresas pueden tener la misma
-- extension en centrales separadas.

alter table profiles add column if not exists sip_extension text;
alter table profiles add column if not exists sip_password text;

-- Un numero, no un nombre: Asterisk marca digitos.
alter table profiles drop constraint if exists profiles_sip_extension_formato;
alter table profiles add constraint profiles_sip_extension_formato
  check (sip_extension is null or sip_extension ~ '^[0-9]{3,6}$');

create unique index if not exists profiles_sip_extension_por_cuenta
  on profiles (account_id, sip_extension)
  where sip_extension is not null;

comment on column profiles.sip_extension is
  'Extension de Asterisk asignada a este usuario (3 a 6 digitos, unica por cuenta).';
comment on column profiles.sip_password is
  'Clave SIP del endpoint. La genera el sistema al asignar la extension.';


-- ============================================================
-- Registro de llamadas
-- ============================================================
--
-- Toda llamada queda registrada, haya sido contestada o no. Guardar solo las
-- contestadas perderia justo lo que interesa medir: cuantas se pierden.
--
-- contact_id es NULLABLE y ON DELETE SET NULL: una llamada a un numero
-- desconocido es un hecho valido, y borrar un contacto no debe borrar la
-- evidencia de que se le llamo.

create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,

  direction text not null check (direction in ('inbound', 'outbound')),
  from_number text,
  to_number text,
  extension text,

  status text not null default 'ringing'
    check (status in ('ringing', 'answered', 'busy', 'failed', 'no_answer', 'completed', 'canceled')),

  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  -- Se calcula sola: dejarla a cargo de quien inserta garantiza que tarde o
  -- temprano alguien guarde una duracion que no coincide con las marcas.
  duration_seconds integer generated always as (
    case when answered_at is not null and ended_at is not null
         then greatest(0, extract(epoch from (ended_at - answered_at))::integer)
    end
  ) stored,

  recording_url text,
  notes text,
  -- Identificador de la llamada en Asterisk, para cruzar con sus registros.
  provider_call_id text,

  created_at timestamptz not null default now()
);

create index if not exists idx_call_logs_account   on call_logs (account_id, started_at desc);
create index if not exists idx_call_logs_contact   on call_logs (contact_id) where contact_id is not null;
create index if not exists idx_call_logs_user      on call_logs (user_id);
create unique index if not exists idx_call_logs_provider
  on call_logs (account_id, provider_call_id) where provider_call_id is not null;

alter table call_logs enable row level security;

drop policy if exists call_logs_select on call_logs;
create policy call_logs_select on call_logs
  for select using (is_account_member(account_id, 'viewer'));

drop policy if exists call_logs_insert on call_logs;
create policy call_logs_insert on call_logs
  for insert with check (is_account_member(account_id, 'agent'));

drop policy if exists call_logs_update on call_logs;
create policy call_logs_update on call_logs
  for update using (is_account_member(account_id, 'agent'));

drop policy if exists call_logs_delete on call_logs;
create policy call_logs_delete on call_logs
  for delete using (is_account_member(account_id, 'admin'));

grant all on call_logs to anon, authenticated, service_role;
