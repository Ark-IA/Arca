-- ============================================================
-- Que la actividad de un contacto cuente TODO lo que le pasó
-- ============================================================
--
-- `timeline_events` solo tenía tres autores: el envío de WhatsApp, la
-- entrada de WhatsApp y el registro de llamadas. El resultado es que la
-- pestaña «Actividad» era el chat otra vez —los mismos mensajes que ya se
-- ven al lado, en el hilo— y nada más: crear el contacto, dejarle una nota,
-- agendarle una visita o cerrarle una tarea no dejaban rastro.
--
-- Lo que faltaba se agrega acá, con disparadores, y no en el código de cada
-- pantalla. Tres razones, y la tercera es la que decide:
--
--   1. Un mismo hecho ocurre por varios caminos. Una tarea se crea desde la
--      ficha, desde el panel de la bandeja, desde la lista de tareas y desde
--      una automatización. En el código habría que acordarse en los cuatro.
--
--   2. La política de `timeline_events` (migración 047) es solo de lectura:
--      RLS deniega por defecto y no hay política de INSERT. El navegador NO
--      PUEDE escribir acá aunque quisiera —a propósito: una línea de tiempo
--      que se edita desde el cliente no sirve como registro de nada—. Un
--      disparador escribe con los permisos de la tabla y no necesita
--      excepción ninguna.
--
--   3. Lo que se registra tiene que ser lo que PASÓ, no lo que una pantalla
--      creyó que pasaba. Si la nota se guardó y el registro no, la ficha
--      miente; atados en la misma transacción, o pasan las dos cosas o no
--      pasa ninguna.
--
-- Los mensajes de chat siguen escribiéndose como hasta ahora, pero la ficha
-- ya no los muestra: están al lado, en el hilo, y repetirlos hundía todo lo
-- demás. El filtro vive en la pantalla y no acá para no perder el dato —la
-- lista general de actividad sí los quiere.

-- ------------------------------------------------------------
-- Ayuda común
-- ------------------------------------------------------------
-- Todos los disparadores escriben igual, así que la escritura vive en un
-- solo sitio. `security definer` con `search_path` fijo: corre con los
-- permisos del dueño de la tabla, y sin el `search_path` alguien podría
-- anteponer un esquema propio y quedarse con lo que se anota.
create or replace function public.anotar_actividad(
  p_account_id uuid,
  p_user_id    uuid,
  p_tipo       text,
  p_titulo     text,
  p_detalle    text,
  p_contact_id uuid,
  p_company_id uuid,
  p_deal_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin ningún registro al que colgarse, el evento no le sirve a nadie: no
  -- aparecería en ninguna ficha.
  if p_contact_id is null and p_company_id is null and p_deal_id is null then
    return;
  end if;

  insert into timeline_events
    (account_id, user_id, event_type, title, description,
     contact_id, company_id, deal_id)
  values
    (p_account_id, p_user_id, p_tipo, p_titulo, p_detalle,
     p_contact_id, p_company_id, p_deal_id);
end;
$$;

-- ------------------------------------------------------------
-- Contacto creado
-- ------------------------------------------------------------
create or replace function public.actividad_contacto_creado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform anotar_actividad(
    new.account_id, new.user_id, 'contact.created',
    'Contacto creado',
    coalesce(new.name, new.phone),
    new.id, new.company_id, null);
  return new;
end;
$$;

drop trigger if exists trg_actividad_contacto_creado on contacts;
create trigger trg_actividad_contacto_creado
  after insert on contacts
  for each row execute function public.actividad_contacto_creado();

-- ------------------------------------------------------------
-- Nota
-- ------------------------------------------------------------
-- El disparador va en `note_targets` y no en `notes`: el texto está en una
-- tabla y a quién pertenece en la otra, y hasta que no existe el vínculo no
-- se sabe en qué ficha va el evento.
create or replace function public.actividad_nota()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n record;
begin
  select account_id, user_id, title, body into n from notes where id = new.note_id;
  if not found then return new; end if;

  perform anotar_actividad(
    n.account_id, n.user_id, 'note.added',
    'Nota agregada',
    -- El título si lo tiene; si no, el principio del texto. Una línea de
    -- tiempo que dice «Nota agregada» seis veces no informa de nada.
    coalesce(nullif(trim(n.title), ''), left(n.body, 120)),
    new.contact_id, new.company_id, new.deal_id);
  return new;
end;
$$;

drop trigger if exists trg_actividad_nota on note_targets;
create trigger trg_actividad_nota
  after insert on note_targets
  for each row execute function public.actividad_nota();

-- ------------------------------------------------------------
-- Tarea creada
-- ------------------------------------------------------------
create or replace function public.actividad_tarea_creada()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ta record;
begin
  select account_id, user_id, title, due_at into ta from tasks where id = new.task_id;
  if not found then return new; end if;

  perform anotar_actividad(
    ta.account_id, ta.user_id, 'task.created',
    'Tarea creada',
    ta.title || case
      when ta.due_at is null then ''
      else ' · vence ' || to_char(ta.due_at, 'DD/MM/YYYY')
    end,
    new.contact_id, new.company_id, new.deal_id);
  return new;
end;
$$;

drop trigger if exists trg_actividad_tarea_creada on task_targets;
create trigger trg_actividad_tarea_creada
  after insert on task_targets
  for each row execute function public.actividad_tarea_creada();

-- ------------------------------------------------------------
-- Tarea terminada
-- ------------------------------------------------------------
-- Se anota al pasar a 'done', y una sola vez: la condición mira el estado
-- ANTERIOR, así que guardar de nuevo una tarea ya terminada no repite el
-- evento.
create or replace function public.actividad_tarea_terminada()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
begin
  if new.status <> 'done' or old.status = 'done' then
    return new;
  end if;

  for d in select contact_id, company_id, deal_id from task_targets where task_id = new.id loop
    perform anotar_actividad(
      new.account_id, new.assignee_id, 'task.completed',
      'Tarea completada', new.title,
      d.contact_id, d.company_id, d.deal_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_actividad_tarea_terminada on tasks;
create trigger trg_actividad_tarea_terminada
  after update on tasks
  for each row execute function public.actividad_tarea_terminada();

-- ------------------------------------------------------------
-- Cita agendada
-- ------------------------------------------------------------
create or replace function public.actividad_cita()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform anotar_actividad(
    new.account_id, new.user_id, 'appointment.scheduled',
    'Cita agendada',
    new.title || ' · ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI'),
    new.contact_id, new.company_id, new.deal_id);
  return new;
end;
$$;

drop trigger if exists trg_actividad_cita on calendar_events;
create trigger trg_actividad_cita
  after insert on calendar_events
  for each row execute function public.actividad_cita();

-- ------------------------------------------------------------
-- Oportunidad: creada y movida de etapa
-- ------------------------------------------------------------
create or replace function public.actividad_negocio()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cuenta uuid;
  v_etapa  text;
begin
  -- `deals` guarda la cuenta a través del contacto en las filas viejas, así
  -- que se toma de ahí, que es el único sitio donde seguro está.
  select account_id into v_cuenta from contacts where id = new.contact_id;
  if v_cuenta is null then return new; end if;

  if tg_op = 'INSERT' then
    perform anotar_actividad(
      v_cuenta, new.user_id, 'deal.created',
      'Oportunidad creada', new.title,
      new.contact_id, null, new.id);
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    select name into v_etapa from pipeline_stages where id = new.stage_id;
    perform anotar_actividad(
      v_cuenta, new.user_id, 'deal.stage_changed',
      'Oportunidad movida',
      new.title || ' → ' || coalesce(v_etapa, 'otra etapa'),
      new.contact_id, null, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_actividad_negocio on deals;
create trigger trg_actividad_negocio
  after insert or update on deals
  for each row execute function public.actividad_negocio();

-- Nada de esto rellena el pasado: los contactos, notas y tareas que ya
-- existen no generan eventos hacia atrás. Inventarles una fecha —la de hoy,
-- o la de creación del registro— llenaría todas las fichas de golpe con
-- actividad que nadie hizo hoy, y la línea de tiempo dejaría de servir para
-- lo que sirve, que es saber qué pasó y cuándo.
