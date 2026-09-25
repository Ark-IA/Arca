-- ============================================================
-- Seguimiento web: un formulario en la página del cliente se vuelve contacto
-- ============================================================
--
-- Un script propio (sin terceros, cookie de primera parte) que el cliente
-- pega en su página. Registra visitas y, sobre todo, captura los formularios
-- que se envían: cada formulario con un teléfono o un correo termina como
-- contacto en ARCA, con de dónde vino (UTM, Google, Facebook, directo…).
--
-- Adaptado de trycompai/crm (licencia MIT, ver licenses/trycompai-crm.txt).
-- Allá es de una sola empresa; acá cada tabla lleva `account_id`.
--
-- Quién escribe: SOLO el servidor, con la clave de servicio. El colector
-- (`/api/t/e`) lo llama el navegador de un desconocido en otra página, sin
-- sesión. Los usuarios leen por RLS; lo único que editan es la
-- configuración del sitio, y solo quien administra.
--
-- Se comparte la base con crm.ark-ia.com: aquí solo se CREAN tablas
-- nuevas, no se toca ninguna existente.

-- ------------------------------------------------------------
-- Sitios: la configuración del script
-- ------------------------------------------------------------
create table if not exists sitios_web (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references accounts(id) on delete cascade,
  nombre               text not null default 'Mi página web',

  -- El identificador público que va en el <script>. Rotarlo es el
  -- interruptor de emergencia si alguien copia el fragmento a otra página.
  clave                text not null unique
    default ('arc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    check (clave ~ '^arc_[0-9a-f]{12}$'),

  -- Dominios desde los que se aceptan datos, ya normalizados (sin www. ni
  -- esquema). Con `limitar_a_dominios` apagado se acepta cualquiera.
  dominios             text[] not null default '{}',
  incluir_subdominios  boolean not null default true,
  limitar_a_dominios   boolean not null default true,

  respetar_dnt         boolean not null default true,
  dias_cookie          integer not null default 395 check (dias_cookie between 0 and 400),

  -- Indicativo con el que se completa un teléfono escrito sin él
  -- ("300 123 4567" → +57 300 123 4567).
  pais_por_defecto     text not null default '57' check (pais_por_defecto ~ '^[1-9][0-9]{0,2}$'),

  -- Etiqueta que se le pone a cada contacto que llega por un formulario.
  -- Es la forma de engancharle una automatización (disparador tag_added).
  etiqueta_id          uuid references tags(id) on delete set null,

  pausado              boolean not null default false,
  paginas_vistas       bigint not null default 0,
  ultima_visita        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists sitios_web_por_cuenta on sitios_web (account_id);

-- ------------------------------------------------------------
-- Visitantes: una cookie, y el contacto al que terminó perteneciendo
-- ------------------------------------------------------------
create table if not exists visitantes_web (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  sitio_id        uuid not null references sitios_web(id) on delete cascade,
  visitante       text not null check (visitante ~ '^[a-zA-Z0-9_-]{8,64}$'),
  contact_id      uuid references contacts(id) on delete set null,
  primer_origen   jsonb,
  ultimo_origen   jsonb,
  primera_visita  timestamptz not null default now(),
  ultima_visita   timestamptz not null default now(),

  unique (sitio_id, visitante)
);

create index if not exists visitantes_web_por_contacto on visitantes_web (contact_id)
  where contact_id is not null;

-- ------------------------------------------------------------
-- Eventos: páginas vistas y clics. Se purgan a los 90 días.
-- ------------------------------------------------------------
create table if not exists eventos_web (
  id           bigint generated always as identity primary key,
  account_id   uuid not null references accounts(id) on delete cascade,
  sitio_id     uuid not null references sitios_web(id) on delete cascade,
  visitante    text not null,
  tipo         text not null check (tipo in ('page_view', 'click')),
  host         text not null,
  ruta         text not null,
  referente    text,
  etiqueta     text,
  fuente       text,
  medio        text,
  campana      text,
  ocurrio_en   timestamptz not null default now()
);

create index if not exists eventos_web_por_visitante on eventos_web (sitio_id, visitante, ocurrio_en desc);
create index if not exists eventos_web_por_fecha on eventos_web (ocurrio_en);

-- ------------------------------------------------------------
-- Formularios: TODO envío se guarda; convertirlo en contacto es aparte
-- y puede negarse (queda el motivo, y la fila sigue ahí para revisarla).
-- ------------------------------------------------------------
create table if not exists formularios_web (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,
  sitio_id        uuid not null references sitios_web(id) on delete cascade,
  visitante       text,
  contact_id      uuid references contacts(id) on delete set null,
  host            text not null,
  ruta            text not null,
  nombre          text,
  email           text,
  telefono        text,
  campos          jsonb not null default '{}',
  primer_origen   jsonb,
  ultimo_origen   jsonb,
  -- Mismo host + ruta + correo/teléfono dentro del mismo minuto = el mismo
  -- envío repetido (doble clic, reintento del navegador).
  clave_unica     text not null unique,
  archivado_en    timestamptz,
  motivo_omitido  text,
  created_at      timestamptz not null default now()
);

create index if not exists formularios_web_por_sitio on formularios_web (sitio_id, created_at desc);
create index if not exists formularios_web_por_contacto on formularios_web (contact_id)
  where contact_id is not null;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table sitios_web      enable row level security;
alter table visitantes_web  enable row level security;
alter table eventos_web     enable row level security;
alter table formularios_web enable row level security;

drop policy if exists sitios_web_select on sitios_web;
create policy sitios_web_select on sitios_web
  for select using (is_account_member(account_id));

-- La configuración la cambia solo quien administra: decide qué páginas
-- pueden crear contactos en la cuenta.
drop policy if exists sitios_web_insert on sitios_web;
create policy sitios_web_insert on sitios_web
  for insert with check (is_account_member(account_id, 'admin'));

drop policy if exists sitios_web_update on sitios_web;
create policy sitios_web_update on sitios_web
  for update using (is_account_member(account_id, 'admin'))
  with check (is_account_member(account_id, 'admin'));

drop policy if exists sitios_web_delete on sitios_web;
create policy sitios_web_delete on sitios_web
  for delete using (is_account_member(account_id, 'admin'));

-- Lo que registra el colector es de solo lectura para los usuarios. Un
-- historial de visitas editable desde el navegador no prueba nada.
--
-- Y se ve con la misma regla que los contactos: quien administra ve todo; un
-- asesor, solo lo que cuelga de un contacto que él puede ver. El `exists`
-- sobre `contacts` corre con los permisos de quien pregunta, así que hereda
-- "cada asesor ve lo suyo" sin repetir aquí esa lógica. Sin esto, un
-- formulario traería el teléfono y el correo de un cliente ajeno.
drop policy if exists visitantes_web_select on visitantes_web;
create policy visitantes_web_select on visitantes_web
  for select using (
    is_account_member(account_id, 'admin')
    or (contact_id is not null
        and exists (select 1 from contacts c where c.id = visitantes_web.contact_id))
  );

drop policy if exists eventos_web_select on eventos_web;
create policy eventos_web_select on eventos_web
  for select using (
    is_account_member(account_id, 'admin')
    or exists (
      select 1 from visitantes_web v
      join contacts c on c.id = v.contact_id
      where v.sitio_id = eventos_web.sitio_id and v.visitante = eventos_web.visitante
    )
  );

drop policy if exists formularios_web_select on formularios_web;
create policy formularios_web_select on formularios_web
  for select using (
    is_account_member(account_id, 'admin')
    or (contact_id is not null
        and exists (select 1 from contacts c where c.id = formularios_web.contact_id))
  );

revoke all on visitantes_web, eventos_web, formularios_web from anon, authenticated;
grant select on visitantes_web, eventos_web, formularios_web to authenticated;
revoke all on sitios_web from anon;
grant select, insert, update, delete on sitios_web to authenticated;

-- ------------------------------------------------------------
-- Sumar visitas sin leer-y-escribir (dos lotes a la vez no se pisan)
-- ------------------------------------------------------------
create or replace function public.sumar_visitas_web(p_sitio uuid, p_vistas integer)
returns void
language sql
security definer
set search_path = public
as $$
  update sitios_web
     set paginas_vistas = paginas_vistas + greatest(p_vistas, 0),
         ultima_visita  = now()
   where id = p_sitio;
$$;

revoke all on function public.sumar_visitas_web(uuid, integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Retención: los eventos se borran a los 90 días, por días completos.
-- Los formularios NO se borran: son la prueba de dónde salió un contacto.
-- Un visitante anónimo sin eventos ni contacto también se va.
-- ------------------------------------------------------------
create or replace function public.purgar_eventos_web(p_dias integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte   timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc'
                           - make_interval(days => p_dias);
  v_borrados integer;
begin
  delete from eventos_web where ocurrio_en < v_corte;
  get diagnostics v_borrados = row_count;

  delete from visitantes_web v
   where v.contact_id is null
     and v.ultima_visita < v_corte
     and not exists (select 1 from formularios_web f
                      where f.sitio_id = v.sitio_id and f.visitante = v.visitante);

  return v_borrados;
end;
$$;

revoke all on function public.purgar_eventos_web(integer) from public, anon, authenticated;
