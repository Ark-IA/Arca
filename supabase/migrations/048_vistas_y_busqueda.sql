-- ============================================================
-- Vistas guardadas y búsqueda global
-- ============================================================


-- ============================================================
-- 1. VISTAS GUARDADAS
-- ============================================================
--
-- "Mis contactos de Bogotá sin actividad hace 30 días" es una pregunta que
-- alguien se hace todos los lunes. Hoy hay que rearmar los filtros cada vez.
-- Una vista guardada es esa combinación con nombre, y compartida con el
-- equipo para que todos miren lo mismo.
--
-- Los filtros van en jsonb y no en columnas: cada módulo filtra por cosas
-- distintas (etiquetas en contactos, sector en empresas, vencimiento en
-- tareas) y una tabla con una columna por filtro posible se llenaría de nulos
-- y habría que migrarla cada vez que se agrega un filtro nuevo. La forma de
-- ese JSON la define la interfaz, que es quien la interpreta.

create table if not exists saved_views (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  -- Quién la creó. Decide quién puede modificarla y a quién pertenece si es
  -- privada.
  user_id     uuid not null references auth.users(id) on delete cascade,

  name        text not null check (length(trim(name)) > 0),
  -- Sobre qué módulo. Enumerado y no libre: una vista de un módulo que no
  -- existe no se podría abrir, y el error aparecería recién al hacer clic.
  resource    text not null check (resource in
                ('contacts', 'companies', 'deals', 'tasks', 'conversations')),

  filters     jsonb not null default '{}'::jsonb,
  sort        jsonb not null default '{}'::jsonb,

  -- Compartida con la cuenta o privada de quien la creó. Por defecto
  -- compartida: el sentido de nombrar una vista es que el equipo la use.
  is_shared   boolean not null default true,
  -- La que se abre sola al entrar al módulo.
  is_default  boolean not null default false,
  -- Orden en la barra de vistas.
  position    integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_saved_views_modulo
  on saved_views (account_id, resource, position);

-- Una sola vista por defecto por persona y por módulo. Sin esto, marcar una
-- segunda dejaría dos y cuál se abre dependería del orden de la consulta.
create unique index if not exists idx_saved_views_una_por_defecto
  on saved_views (account_id, resource, user_id) where is_default;

alter table saved_views enable row level security;

-- Se ve si es compartida, o si es tuya.
drop policy if exists saved_views_select on saved_views;
create policy saved_views_select on saved_views
  for select using (
    is_account_member(account_id, 'viewer')
    and (is_shared or user_id = auth.uid())
  );

drop policy if exists saved_views_insert on saved_views;
create policy saved_views_insert on saved_views
  for insert with check (
    is_account_member(account_id, 'agent') and user_id = auth.uid()
  );

-- Modificar y borrar: solo quien la creó, o un administrador. Sin esto,
-- cualquiera podría reescribir la vista compartida que usa todo el equipo.
drop policy if exists saved_views_update on saved_views;
create policy saved_views_update on saved_views
  for update using (
    is_account_member(account_id, 'agent')
    and (user_id = auth.uid() or is_account_member(account_id, 'admin'))
  );

drop policy if exists saved_views_delete on saved_views;
create policy saved_views_delete on saved_views
  for delete using (
    is_account_member(account_id, 'agent')
    and (user_id = auth.uid() or is_account_member(account_id, 'admin'))
  );

grant all on saved_views to anon, authenticated, service_role;

drop trigger if exists trg_saved_views_updated on saved_views;
create trigger trg_saved_views_updated before update on saved_views
  for each row execute function public.tocar_updated_at();


-- ============================================================
-- 2. BÚSQUEDA GLOBAL
-- ============================================================
--
-- Un solo cuadro que busca a la vez en contactos, empresas, negocios, tareas
-- y notas. Hacerlo desde el cliente serían cinco consultas en paralelo y cinco
-- listas que ordenar a mano; una función lo resuelve en una ida y con un orden
-- coherente.
--
-- SECURITY INVOKER (el modo por defecto, no se declara DEFINER): la función
-- corre con los permisos de quien llama, así que las políticas RLS de cada
-- tabla se aplican igual que en una consulta normal. Con DEFINER habría que
-- reimplementar a mano el control de acceso de cinco tablas, y el primer
-- descuido filtraría datos de otra cuenta.

create extension if not exists pg_trgm;

-- Índices de trigramas: son los que hacen que `ilike '%texto%'` no recorra la
-- tabla entera. Sin ellos la búsqueda funciona igual y se vuelve lenta en
-- cuanto hay unos miles de registros.
create index if not exists idx_busqueda_contacts_nombre on contacts using gin (name gin_trgm_ops);
create index if not exists idx_busqueda_contacts_email  on contacts using gin (email gin_trgm_ops);
create index if not exists idx_busqueda_companies       on companies using gin (name gin_trgm_ops);
create index if not exists idx_busqueda_deals           on deals using gin (title gin_trgm_ops);
create index if not exists idx_busqueda_tasks           on tasks using gin (title gin_trgm_ops);

create or replace function public.buscar_global(
  p_termino text,
  p_limite  integer default 8
) returns table (
  tipo      text,
  id        uuid,
  titulo    text,
  subtitulo text,
  -- Cuánto se parece. Sirve para ordenar entre módulos distintos.
  parecido  real
)
language sql
stable
set search_path = public
as $$
  with t as (select trim(p_termino) as q)
  (
    select 'contact', c.id, coalesce(nullif(c.name, ''), c.phone, 'Sin nombre'),
           coalesce(c.email, c.phone, ''),
           greatest(
             similarity(coalesce(c.name, ''), t.q),
             similarity(coalesce(c.email, ''), t.q),
             similarity(coalesce(c.phone, ''), t.q)
           )
    from contacts c, t
    where c.name  ilike '%' || t.q || '%'
       or c.email ilike '%' || t.q || '%'
       or c.phone ilike '%' || t.q || '%'
    order by 5 desc
    limit p_limite
  )
  union all
  (
    select 'company', e.id, e.name, coalesce(e.domain, e.industry, ''),
           greatest(similarity(e.name, t.q), similarity(coalesce(e.domain, ''), t.q))
    from companies e, t
    where e.name   ilike '%' || t.q || '%'
       or e.domain ilike '%' || t.q || '%'
    order by 5 desc
    limit p_limite
  )
  union all
  (
    select 'deal', d.id, d.title, '', similarity(d.title, t.q)
    from deals d, t
    where d.title ilike '%' || t.q || '%'
    order by 5 desc
    limit p_limite
  )
  union all
  (
    select 'task', x.id, x.title, x.status, similarity(x.title, t.q)
    from tasks x, t
    where x.title ilike '%' || t.q || '%'
    order by 5 desc
    limit p_limite
  )
  union all
  (
    -- En las notas se busca también en el cuerpo, y por eso el subtítulo es un
    -- recorte: el resultado tiene que dejar ver POR QUÉ coincidió, o parece
    -- que salió de la nada.
    select 'note', n.id, coalesce(nullif(n.title, ''), 'Nota'),
           left(regexp_replace(n.body, '\s+', ' ', 'g'), 90),
           greatest(similarity(coalesce(n.title, ''), t.q), similarity(n.body, t.q))
    from notes n, t
    where n.title ilike '%' || t.q || '%'
       or n.body  ilike '%' || t.q || '%'
    order by 5 desc
    limit p_limite
  )
$$;

alter function public.buscar_global(text, integer) owner to postgres;
revoke all on function public.buscar_global(text, integer) from public;
grant execute on function public.buscar_global(text, integer) to authenticated, service_role;

comment on function public.buscar_global(text, integer) is
  'Busca en contactos, empresas, negocios, tareas y notas a la vez. Corre con '
  'los permisos de quien llama, así que RLS filtra por cuenta sin que la '
  'función tenga que saber nada del inquilinato.';


alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
