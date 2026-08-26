-- ============================================================
-- Canales: WhatsApp, Facebook Messenger e Instagram
-- ============================================================
--
-- Hasta aqui el producto asumia un solo canal. La configuracion vivia en
-- `whatsapp_config` y las conversaciones no decian de donde venian, porque
-- solo podian venir de un lado.
--
-- Se agregan Messenger e Instagram como canales SEPARADOS, no unificados:
-- cada cuenta conectada es independiente y las conversaciones saben a cual
-- pertenecen. Esa separacion es la que permite medir cada canal por su
-- cuenta -- cuantas conversaciones entran por Instagram, cuanto tarda la
-- respuesta en Messenger -- que es imposible cuando todo cae en una bolsa.
--
-- `whatsapp_config` NO se elimina: sigue siendo la fuente para WhatsApp y
-- todo el codigo existente la usa. La tabla nueva convive con ella y se
-- ocupa de los canales nuevos. Migrar WhatsApp aqui seria un cambio grande
-- sin beneficio inmediato, y romperia el webhook que acaba de empezar a
-- funcionar.

create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  channel text not null check (channel in ('facebook', 'instagram')),

  -- El identificador que Meta usa para esta cuenta:
  --   facebook  -> Page ID
  --   instagram -> Instagram Professional Account ID
  external_id text not null,
  -- Nombre visible, para que el operador reconozca la cuenta en la pantalla
  -- sin tener que recordar un numero de 15 digitos.
  name text,

  -- Cifrado AES-256-GCM con ENCRYPTION_KEY, igual que el de WhatsApp.
  -- Nunca en claro. Ver src/lib/whatsapp/encryption.ts
  access_token text not null,
  verify_token text,

  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error')),
  last_error text,
  connected_at timestamptz,

  -- Espacio para lo que cada canal necesite y no merezca columna propia
  -- (page_access_token de larga duracion, ig_business_account, etc.).
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una cuenta de Meta no puede estar conectada dos veces a la misma
  -- organizacion: duplicaria cada mensaje entrante.
  unique (account_id, channel, external_id)
);

create index if not exists idx_channel_connections_account
  on channel_connections (account_id, channel);
-- El webhook llega con el id externo y sin saber de que organizacion es:
-- este indice es el que resuelve esa busqueda en cada mensaje.
create index if not exists idx_channel_connections_externo
  on channel_connections (channel, external_id);

alter table channel_connections enable row level security;

drop policy if exists channel_connections_select on channel_connections;
create policy channel_connections_select on channel_connections
  for select using (is_account_member(account_id, 'viewer'));

drop policy if exists channel_connections_write on channel_connections;
create policy channel_connections_write on channel_connections
  for all using (is_account_member(account_id, 'admin'))
  with check (is_account_member(account_id, 'admin'));

grant all on channel_connections to anon, authenticated, service_role;


-- ============================================================
-- De que canal viene cada conversacion
-- ============================================================
--
-- El default 'whatsapp' es lo que hace que esta migracion no rompa nada:
-- las conversaciones que ya existen siguen siendo de WhatsApp sin tener que
-- tocarlas una por una.

alter table conversations add column if not exists channel text not null default 'whatsapp';
alter table conversations drop constraint if exists conversations_channel_valido;
alter table conversations add constraint conversations_channel_valido
  check (channel in ('whatsapp', 'facebook', 'instagram'));

alter table conversations add column if not exists connection_id uuid
  references channel_connections(id) on delete set null;

comment on column conversations.channel is
  'Canal por el que entro la conversacion. Es la columna que permite separar las bandejas y medir cada canal por su cuenta.';
comment on column conversations.connection_id is
  'Cuenta conectada concreta. Null en WhatsApp, cuya configuracion vive en whatsapp_config.';

-- La bandeja filtra por canal y ordena por actividad: el indice cubre esa
-- consulta exacta, que es la que corre en cada carga de pantalla.
create index if not exists idx_conversations_canal
  on conversations (account_id, channel, last_message_at desc);


-- ============================================================
-- Identificadores del contacto en cada canal
-- ============================================================
--
-- Meta da un identificador distinto por canal y por negocio:
--   facebook  -> PSID  (Page-Scoped ID)
--   instagram -> IGSID (Instagram-Scoped ID)
--
-- Son la direccion de respuesta de ese canal, igual que el telefono lo es
-- en WhatsApp. Se guardan en columnas separadas y no en una sola generica
-- porque la misma persona puede escribir por los dos, y necesitamos poder
-- responderle por el que uso.

alter table contacts add column if not exists facebook_id text;
alter table contacts add column if not exists instagram_id text;

comment on column contacts.facebook_id is
  'PSID: identificador del usuario para esta pagina de Facebook. Es la direccion de respuesta en Messenger.';
comment on column contacts.instagram_id is
  'IGSID: identificador del usuario para esta cuenta de Instagram. Es la direccion de respuesta en Instagram.';

create unique index if not exists idx_contacts_facebook_id
  on contacts (account_id, facebook_id)
  where facebook_id is not null and facebook_id <> '';
create unique index if not exists idx_contacts_instagram_id
  on contacts (account_id, instagram_id)
  where instagram_id is not null and instagram_id <> '';

-- La via de contacto ahora tambien puede ser una red social.
alter table contacts drop constraint if exists contacts_via_de_contacto;
alter table contacts add constraint contacts_via_de_contacto
  check (
    (phone is not null and phone <> '')
    or (whatsapp_id is not null and whatsapp_id <> '')
    or (whatsapp_user_id is not null and whatsapp_user_id <> '')
    or (facebook_id is not null and facebook_id <> '')
    or (instagram_id is not null and instagram_id <> '')
    or (email is not null and email <> '')
  ) not valid;
