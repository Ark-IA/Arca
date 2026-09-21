-- ============================================================
-- Reportes de pauta de Meta
-- ============================================================
--
-- SOLO TABLAS NUEVAS. Esta base la comparte crm.ark-ia.com, así que la
-- regla no es «con cuidado»: es que no se toca ni una columna existente.
-- Todo lo de acá abajo nace de cero, y si mañana se borrara entero, el
-- CRM no se enteraría.
--
-- Qué guarda y por qué guarda algo:
--
-- Las métricas se piden a la API de Meta, que es lenta, tiene cupo diario
-- y cobra por llamada en atención. Abrir la pantalla no puede significar
-- una llamada a Meta por cada gráfico: se traen una vez, se guardan, y la
-- pantalla lee de acá. Además así hay historia — Meta solo devuelve lo
-- que le pidas del rango que le pidas, y sin guardar nada no habría forma
-- de comparar este mes con el anterior.

-- ------------------------------------------------------------
-- Las cuentas publicitarias conectadas
-- ------------------------------------------------------------
create table if not exists meta_ad_accounts (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,

  -- El identificador de Meta, tal cual: 'act_1234567890'. Se guarda con
  -- el prefijo porque es como lo pide la API y como se ve en el
  -- administrador de anuncios; quitarlo obligaría a recordar ponerlo en
  -- cada llamada.
  ad_account_id text not null,
  name          text,
  currency      text,

  -- El token que lee las métricas. Cifrado, igual que los de los canales:
  -- es un token de Meta con permiso sobre la pauta, o sea que da acceso a
  -- cuánto se gasta y en qué. Nunca sale de la base en claro.
  access_token  text not null,

  status        text not null default 'connected'
    check (status in ('connected', 'error')),
  last_error    text,
  last_synced_at timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- La misma cuenta publicitaria no se conecta dos veces en la misma
  -- organización: sería la misma pauta contada doble en cada total.
  unique (account_id, ad_account_id)
);

create index if not exists meta_ad_accounts_por_cuenta
  on meta_ad_accounts (account_id);

-- ------------------------------------------------------------
-- Las métricas, un renglón por anuncio y por día
-- ------------------------------------------------------------
-- El grano es DIARIO y por anuncio. Es el más fino que devuelve Meta sin
-- pedir permisos extra, y de ahí para arriba todo se puede sumar: por
-- campaña, por semana, por mes. Al revés no: guardando totales mensuales
-- no hay forma de responder «qué pasó el martes».
create table if not exists meta_ad_insights (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references accounts(id) on delete cascade,
  ad_account_id  uuid not null references meta_ad_accounts(id) on delete cascade,

  fecha          date not null,

  campaign_id    text,
  campaign_name  text,
  adset_id       text,
  adset_name     text,
  ad_id          text,
  ad_name        text,

  -- Lo que se gastó y lo que se obtuvo.
  gasto          numeric(14,2) not null default 0,
  impresiones    bigint not null default 0,
  alcance        bigint not null default 0,
  clics          bigint not null default 0,
  -- Meta llama «resultados» a lo que la campaña buscaba: mensajes,
  -- formularios, compras. Se guarda el número y TAMBIÉN qué era, porque
  -- 40 resultados no significan nada si no se sabe de qué.
  resultados     bigint not null default 0,
  tipo_resultado text,

  -- La respuesta completa de Meta. Ocupa poco y evita el problema de
  -- siempre: dentro de dos meses hace falta una métrica que hoy no se
  -- guardó, y sin esto habría que volver a pedirle a Meta un pasado que
  -- quizá ya no devuelve.
  crudo          jsonb not null default '{}'::jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- La clave de la sincronización: volver a traer el mismo día
  -- ACTUALIZA en vez de duplicar. Hace falta porque Meta corrige sus
  -- cifras durante días — el gasto de ayer no es definitivo hasta 72
  -- horas después — así que el mismo día se pide muchas veces.
  unique (ad_account_id, fecha, ad_id)
);

create index if not exists meta_ad_insights_por_cuenta_fecha
  on meta_ad_insights (account_id, fecha desc);
create index if not exists meta_ad_insights_por_campana
  on meta_ad_insights (ad_account_id, campaign_id, fecha desc);

-- ------------------------------------------------------------
-- Quién puede ver esto
-- ------------------------------------------------------------
alter table meta_ad_accounts enable row level security;
alter table meta_ad_insights enable row level security;

-- Leer: cualquier miembro de la cuenta. Escribir: nadie desde el
-- navegador. La sincronización la hace el servidor con la clave de
-- servicio, igual que la línea de tiempo. Un reporte de pauta que se
-- puede editar desde el cliente no sirve para tomar ninguna decisión.
drop policy if exists "miembros leen cuentas de pauta" on meta_ad_accounts;
create policy "miembros leen cuentas de pauta" on meta_ad_accounts
  for select using (is_account_member(account_id));

drop policy if exists "miembros leen metricas" on meta_ad_insights;
create policy "miembros leen metricas" on meta_ad_insights
  for select using (is_account_member(account_id));

-- El token NO se puede leer desde el navegador aunque la fila sí.
--
-- Y el orden importa. El primer intento fue `revoke select (access_token)`
-- a secas, y NO sirvió de nada: en Postgres un permiso sobre la tabla
-- entera cubre todas sus columnas, así que quitar una columna mientras el
-- rol conserva la tabla no quita nada. Supabase concede la tabla completa
-- a `anon` y `authenticated` en cuanto se crea.
--
-- Lo que sí funciona es al revés: se quita TODO y después se conceden una
-- por una las columnas que sí pueden salir. Lo que no esté en esa lista no
-- viaja al navegador, y `access_token` no está.
revoke all on meta_ad_accounts from anon, authenticated;
revoke all on meta_ad_insights from anon, authenticated;

-- `anon` no recibe nada: cuánto se gasta en pauta no es información de
-- una visita sin sesión.
grant select on meta_ad_insights to authenticated;
grant select (id, account_id, user_id, ad_account_id, name, currency,
              status, last_error, last_synced_at, created_at, updated_at)
  on meta_ad_accounts to authenticated;

-- Escribir, nadie: la sincronización corre en el servidor con la clave de
-- servicio, que se salta la RLS. Sin este `revoke`, cualquiera con sesión
-- podría inventarse el gasto del mes.
