-- ============================================================
-- La cola por omisión de cada conexión
-- ============================================================
--
-- Una conexión puede tener cola: «lo que entre por la línea de ventas va a
-- la cola de Ventas». Hasta acá eso era un dato guardado que nadie leía —la
-- pantalla lo ofrecía, se guardaba, y las conversaciones seguían naciendo
-- sin cola—. Este disparador es lo que lo hace cierto.
--
-- Va en la base y no en el webhook porque las conversaciones nacen por
-- varios caminos: el webhook de WhatsApp, el de Meta, el envío saliente que
-- abre hilo, y la API pública. Ponerlo en uno solo dejaría los otros tres
-- comportándose distinto, y la diferencia solo se notaría el día que un
-- asesor no ve una conversación que le tocaba.
--
-- Solo actúa cuando la conversación viene SIN cola. Un flujo que entrega a
-- Soporte manda sobre la cola de la conexión: quien armó el flujo tomó una
-- decisión más específica y más reciente que la de la configuración.

create or replace function public.cola_por_omision_de_la_conexion()
returns trigger
language plpgsql
-- `search_path` fijo: sin él, un esquema propio en el camino de búsqueda
-- podría suplantar a `channel_connections` y decidir a qué cola entra cada
-- conversación.
set search_path = public
as $$
begin
  if new.cola_id is null and new.connection_id is not null then
    select c.cola_id into new.cola_id
    from channel_connections c
    where c.id = new.connection_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cola_de_la_conexion on conversations;
create trigger trg_cola_de_la_conexion
  before insert on conversations
  for each row execute function public.cola_por_omision_de_la_conexion();

-- Las conversaciones que ya están abiertas NO se tocan. Moverlas de cola
-- ahora cambiaría quién las ve sin que nadie lo haya pedido, y algunas
-- están asignadas a un asesor concreto desde hace días. La regla nueva rige
-- de acá en adelante.
