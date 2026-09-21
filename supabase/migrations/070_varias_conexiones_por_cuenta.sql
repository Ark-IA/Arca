-- ============================================================
-- Varias conexiones por cuenta, cada una con su personalidad
-- ============================================================
--
-- Un cliente puede tener dos líneas de WhatsApp —ventas y soporte—, tres
-- páginas de Facebook y una cuenta de Instagram. Hoy el CRM asume UNA de
-- cada cosa y, peor, UN solo prompt para todo: el mismo agente contesta con
-- la misma personalidad venga de donde venga, y se confunde.
--
-- El diseño tiene una sola idea: `channel_connections` pasa a ser el
-- registro de TODAS las conexiones, incluidas las líneas de WhatsApp. Cada
-- fila es «una entrada al negocio» con su nombre, su prompt y sus reglas.
-- `whatsapp_config` se queda como la tabla de detalle técnico de cada línea
-- —waba_id, phone_number_id, tokens— colgando de su conexión, porque esos
-- campos no existen en los otros canales y meterlos en un jsonb genérico
-- sería perder los tipos y la validación.
--
-- REGLA QUE ATRAVIESA TODO: cada campo nuevo es opcional, y vacío significa
-- «usa lo de la cuenta». Así las conexiones que ya existen siguen
-- comportándose exactamente igual el día del despliegue, sin que nadie tenga
-- que abrir nada a configurar. Lo nuevo se activa cuando alguien lo escribe,
-- no antes.

-- ------------------------------------------------------------
-- 1. La conexión, con personalidad propia
-- ------------------------------------------------------------

alter table channel_connections
  -- Null = usar el prompt de la cuenta. Es la diferencia entre «esta línea
  -- no tiene nada especial» y «esta línea no debe decir nada», que con una
  -- cadena vacía serían indistinguibles.
  add column if not exists system_prompt text,

  -- Interruptor POR CONEXIÓN, que se suma al de la cuenta. Los dos tienen
  -- que estar encendidos para que el agente conteste ahí: el de la cuenta
  -- es el maestro, este es el de la línea. Por defecto encendido, para que
  -- una conexión nueva se comporte como esperaría cualquiera.
  add column if not exists ai_enabled boolean not null default true,

  -- Cola a la que cae lo que entre por aquí, sin que ningún flujo lo derive.
  -- Null = no encolar, que es lo de hoy.
  add column if not exists cola_id uuid references colas(id) on delete set null,

  -- Para ordenar la lista en pantalla sin depender de la fecha de creación.
  add column if not exists orden integer not null default 0;

comment on column channel_connections.system_prompt is
  'Personalidad del agente en esta conexión. NULL = usa el prompt de la '
  'cuenta. Es lo que evita que la línea de ventas y la de soporte contesten '
  'igual.';

comment on column channel_connections.ai_enabled is
  'Interruptor de esta conexión. Se SUMA al de la cuenta: los dos tienen que '
  'estar encendidos para que el agente conteste aquí.';

-- ------------------------------------------------------------
-- 2. WhatsApp deja de estar limitado a una línea
-- ------------------------------------------------------------
--
-- El webhook ya resolvía por `phone_number_id` —mira qué línea recibió el
-- mensaje, no de quién es la cuenta— así que la entrada ya estaba
-- preparada. Lo único que lo impedía era esta restricción.

alter table whatsapp_config
  add column if not exists connection_id uuid references channel_connections(id) on delete cascade;

alter table whatsapp_config drop constraint if exists whatsapp_config_account_id_key;

-- `phone_number_id` SIGUE siendo único en toda la base, y no por descuido:
-- es la llave con la que el webhook encuentra a quién pertenece un mensaje
-- entrante. Dos filas con el mismo número harían que un mensaje se entregara
-- a la cuenta equivocada.

create index if not exists whatsapp_config_por_cuenta on whatsapp_config (account_id);
create index if not exists whatsapp_config_por_conexion on whatsapp_config (connection_id);

-- ------------------------------------------------------------
-- 3. Las conexiones que ya existen se registran, sin cambiar nada
-- ------------------------------------------------------------
--
-- Se les crea su fila y se les engancha lo que ya tenían. Todos los campos
-- nuevos quedan vacíos, así que siguen usando el prompt de la cuenta y se
-- comportan igual que ayer. Aparecen en la lista y se les puede dar
-- personalidad cuando alguien quiera, no antes.

-- La tabla nació para Meta y su restricción solo admitía facebook e
-- instagram. Ahora es el registro de TODOS los canales, así que tiene que
-- admitir también whatsapp — si no, la línea que ya funciona no puede
-- siquiera registrarse.
alter table channel_connections drop constraint if exists channel_connections_channel_check;
alter table channel_connections add constraint channel_connections_channel_check
  check (channel in ('whatsapp', 'facebook', 'instagram'));

do $$
declare
  w record;
  v_conexion uuid;
begin
  for w in select * from whatsapp_config where connection_id is null loop
    insert into channel_connections
      (account_id, user_id, channel, external_id, name, access_token,
       verify_token, status, connected_at, metadata)
    values
      (w.account_id, w.user_id, 'whatsapp', w.phone_number_id,
       'WhatsApp principal', w.access_token, w.verify_token,
       w.status, w.connected_at,
       -- Se deja constancia de que esta fila nació de una migración y no de
       -- alguien conectando una línea: si algo sale raro, se sabe cuáles
       -- mirar primero.
       jsonb_build_object('origen', 'migracion_070'))
    on conflict (account_id, channel, external_id) do update
      set updated_at = now()
    returning id into v_conexion;

    if v_conexion is null then
      select id into v_conexion from channel_connections
      where account_id = w.account_id and channel = 'whatsapp'
        and external_id = w.phone_number_id;
    end if;

    update whatsapp_config set connection_id = v_conexion where id = w.id;
  end loop;
end $$;

-- Las conversaciones de WhatsApp no apuntaban a ninguna conexión porque no
-- existía ninguna. Ahora sí, y sin eso el agente no sabría con qué prompt
-- contestar en los hilos que ya están abiertos.
update conversations c
set connection_id = w.connection_id
from whatsapp_config w
where c.channel = 'whatsapp'
  and c.account_id = w.account_id
  and c.connection_id is null
  and w.connection_id is not null;

-- ------------------------------------------------------------
-- 4. Flujos por conexión
-- ------------------------------------------------------------
--
-- `flows.channels` ya elegía CANALES. Esto añade poder elegir CONEXIONES
-- concretas: el menú de la línea de ventas distinto al de soporte.
--
-- Vacío = todas las conexiones de los canales marcados, que es lo de hoy.
-- Se guarda como lista y no como tabla puente porque se lee entera en cada
-- mensaje entrante y nunca se consulta al revés.

alter table flows
  add column if not exists connection_ids uuid[] not null default '{}'::uuid[];

comment on column flows.connection_ids is
  'Conexiones concretas en las que corre este flujo. Vacío = todas las del '
  'canal, que es como se comportaba antes de existir esta columna.';

-- ------------------------------------------------------------
-- 5. Base de conocimiento por conexión
-- ------------------------------------------------------------
--
-- Null = documento compartido por todas las conexiones. Con valor, solo lo
-- ve esa. Así la línea de soporte puede tener sus manuales sin que el agente
-- comercial los cite en mitad de una venta.

alter table ai_knowledge_documents
  add column if not exists connection_id uuid references channel_connections(id) on delete cascade;

alter table ai_knowledge_chunks
  add column if not exists connection_id uuid references channel_connections(id) on delete cascade;

-- El fragmento repite la conexión de su documento a propósito. La búsqueda
-- semántica recorre `ai_knowledge_chunks` y filtrar por ahí evita unir con
-- la tabla de documentos en cada consulta — que es la consulta más caliente
-- de todo el agente.
create index if not exists ai_knowledge_chunks_por_conexion
  on ai_knowledge_chunks (connection_id) where connection_id is not null;

create index if not exists ai_knowledge_documents_por_conexion
  on ai_knowledge_documents (connection_id) where connection_id is not null;

-- ------------------------------------------------------------
-- 6. Permisos: NO se tocan
-- ------------------------------------------------------------
--
-- La tentación era restringir la lectura de `channel_connections` a
-- administración, porque la tabla guarda tokens de acceso. Se comprobó a
-- quién rompería: el Resumen de Configuración lee esta tabla para pintar el
-- estado de los canales, y ese Resumen lo ve CUALQUIER rol. Con la lectura
-- cerrada, un observador vería «Facebook: sin conectar» estando conectado —
-- información falsa, que es peor que información de más.
--
-- El token tampoco se protege restringiendo la fila entera: RLS filtra
-- filas, no columnas. Quien necesite esconder el token tiene que dejar de
-- seleccionarlo, y eso ya lo hacen las rutas que lo devuelven.
