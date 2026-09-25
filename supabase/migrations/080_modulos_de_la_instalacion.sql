-- ============================================================
-- Módulos de la instalación
-- ============================================================
--
-- ARCA se instala un servidor por cliente. Esta tabla dice qué partes tiene
-- activas ESTA instalación. Una fila por módulo apagado o encendido a
-- propósito; un módulo sin fila está ACTIVO, así que una instalación nueva
-- (o una que se actualiza) arranca con todo funcionando.
--
-- No lleva account_id: es de la instalación, no de una cuenta.
--
-- Quién la escribe: solo el superadministrador, por
-- /api/superadmin/modulos con la clave de servicio. Ni siquiera el dueño de
-- la cuenta puede: es él quien paga por los módulos. Leerla puede cualquiera
-- (también sin sesión: la API pública y el colector web la consultan), y no
-- revela nada que el menú no muestre.

create table if not exists modulos_instalacion (
  clave            text primary key check (clave ~ '^[a-z_]{2,40}$'),
  activo           boolean not null default true,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);

alter table modulos_instalacion enable row level security;

drop policy if exists modulos_instalacion_select on modulos_instalacion;
create policy modulos_instalacion_select on modulos_instalacion
  for select using (true);

revoke all on modulos_instalacion from anon, authenticated;
grant select on modulos_instalacion to anon, authenticated;
