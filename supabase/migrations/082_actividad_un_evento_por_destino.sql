-- ============================================================
-- Actividad: un evento por cada ficha, no uno con tres destinos
-- ============================================================
--
-- La migración 047 le puso a `timeline_events` la restricción
-- `timeline_un_destino`: cada evento cuelga de UNA ficha (contacto, empresa
-- u oportunidad). La 073 escribió `anotar_actividad` pasándole varias a la
-- vez, y los disparadores que la llaman con más de una hacen fallar la
-- operación que los dispara. Como el disparador corre en la misma
-- transacción, falla el INSERT o el UPDATE de verdad:
--
--   * crear una oportunidad con contacto         (contacto + oportunidad)
--   * moverla de etapa                            (contacto + oportunidad)
--   * crear un contacto que ya tiene empresa      (contacto + empresa)
--   * agendar una cita con contacto y oportunidad (hasta las tres)
--
-- Encontrado el 24-sep al aplicar todas las migraciones sobre una base
-- vacía y crear una oportunidad.
--
-- Se arregla en el único punto por donde escriben todos: una fila por cada
-- destino. Además es lo que se quería mostrar: el evento aparece en la
-- ficha del contacto Y en la de la oportunidad.

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
  if p_contact_id is not null then
    insert into timeline_events (account_id, user_id, event_type, title, description, contact_id)
    values (p_account_id, p_user_id, p_tipo, p_titulo, p_detalle, p_contact_id);
  end if;

  if p_company_id is not null then
    insert into timeline_events (account_id, user_id, event_type, title, description, company_id)
    values (p_account_id, p_user_id, p_tipo, p_titulo, p_detalle, p_company_id);
  end if;

  if p_deal_id is not null then
    insert into timeline_events (account_id, user_id, event_type, title, description, deal_id)
    values (p_account_id, p_user_id, p_tipo, p_titulo, p_detalle, p_deal_id);
  end if;
end;
$$;
