-- ============================================================
-- Horarios de atención, por línea
-- ============================================================
--
-- SOLO TABLAS NUEVAS. La base la comparte crm.ark-ia.com y no se toca
-- nada de lo que ya existe.
--
-- El problema que resuelve: hoy, un mensaje que llega a las 11 de la
-- noche de un domingo se trata igual que uno de un martes al mediodía.
-- El agente contesta, el flujo arranca y la conversación entra a una cola
-- donde no hay nadie hasta el lunes. El cliente queda esperando sin saber
-- que espera.
--
-- El horario es POR LÍNEA y no por cuenta porque no todas atienden igual:
-- ventas puede cerrar a las 6 y soporte tener guardia hasta las 10. Con
-- un solo horario para todo, la línea más exigente obliga a la otra.
--
-- Dos tablas y no una: un día puede tener VARIOS tramos. En Colombia lo
-- normal es 8–12 y 2–6, y con un solo par de horas por día habría que
-- elegir entre cerrar al almuerzo o mentir sobre el horario.

create table if not exists horarios_de_atencion (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,

  -- La línea a la que aplica. Nulo = el horario por omisión de la cuenta,
  -- el que rige donde no haya uno propio.
  connection_id uuid references channel_connections(id) on delete cascade,

  nombre        text not null default 'Horario de atención',

  -- La zona horaria importa y no es un detalle: el servidor piensa en UTC
  -- y «las 6 de la tarde» en Bogotá son las 23:00 UTC. Sin esto, un
  -- horario de 8 a 18 cerraría a la 1 de la tarde hora local.
  zona_horaria  text not null default 'America/Bogota',

  /**
   * Qué se le contesta a quien escribe fuera de horario.
   *
   * Vacío significa no contestar nada — hay operaciones que prefieren el
   * silencio a un mensaje automático. Es una decisión, no un olvido, y
   * por eso se admite.
   */
  mensaje_fuera text,

  activo        boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Un horario por línea, y uno solo por cuenta para el caso general.
-- Se hace con dos índices parciales porque `unique (account_id,
-- connection_id)` NO impide dos filas con `connection_id` nulo: en SQL,
-- dos nulos no son iguales entre sí.
create unique index if not exists horarios_una_por_conexion
  on horarios_de_atencion (account_id, connection_id)
  where connection_id is not null;

create unique index if not exists horarios_uno_por_cuenta
  on horarios_de_atencion (account_id)
  where connection_id is null;

-- ------------------------------------------------------------
-- Los tramos
-- ------------------------------------------------------------
create table if not exists horarios_tramos (
  id         uuid primary key default gen_random_uuid(),
  horario_id uuid not null references horarios_de_atencion(id) on delete cascade,

  -- 0 = domingo … 6 = sábado. Es la numeración de JavaScript
  -- (`getDay()`), que es donde se evalúa, para no traducir en cada
  -- comparación y equivocarse una vez.
  dia        smallint not null check (dia between 0 and 6),

  desde      time not null,
  hasta      time not null,

  created_at timestamptz not null default now(),

  -- Un tramo que termina antes de empezar no es un tramo. Se rechaza en
  -- la base y no solo en la pantalla: la API también escribe acá.
  constraint horarios_tramo_valido check (hasta > desde)
);

create index if not exists horarios_tramos_por_horario
  on horarios_tramos (horario_id, dia);

-- ------------------------------------------------------------
-- Quién ve y quién escribe
-- ------------------------------------------------------------
alter table horarios_de_atencion enable row level security;
alter table horarios_tramos enable row level security;

-- Leer: cualquier miembro. Un asesor necesita saber si está en horario
-- tanto como quien administra.
drop policy if exists "miembros leen horarios" on horarios_de_atencion;
create policy "miembros leen horarios" on horarios_de_atencion
  for select using (is_account_member(account_id));

drop policy if exists "miembros leen tramos" on horarios_tramos;
create policy "miembros leen tramos" on horarios_tramos
  for select using (
    exists (
      select 1 from horarios_de_atencion h
      where h.id = horarios_tramos.horario_id
        and is_account_member(h.account_id)
    )
  );

-- Escribir, nadie desde el navegador: cambiar el horario cambia cómo se
-- comporta el sistema con TODOS los que escriban a partir de ese momento.
-- Pasa por la API, que exige rol de administrador.
revoke all on horarios_de_atencion from anon, authenticated;
revoke all on horarios_tramos from anon, authenticated;
grant select on horarios_de_atencion to authenticated;
grant select on horarios_tramos to authenticated;
