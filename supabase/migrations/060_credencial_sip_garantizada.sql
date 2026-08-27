-- ============================================================
-- Una extensión asignada siempre tiene credencial
-- ============================================================
--
-- El teléfono de alguien sale de la vista `sip_endpoints`, que une
-- `profiles.sip_extension` con `sip_credentials`. Un JOIN, no un LEFT JOIN:
-- un endpoint sin clave no se puede registrar contra Asterisk, así que no
-- tiene sentido generarlo.
--
-- El problema es cómo FALLA cuando esas dos mitades se separan. Un perfil con
-- extensión y sin credencial desaparece de la vista, Asterisk no recibe el
-- endpoint, la burbuja no aparece, y no hay un solo error en ninguna parte:
-- ni en la pantalla, ni en el registro de la aplicación, ni en Asterisk.
-- Desde afuera se ve como «le asigné la extensión y no le sale el teléfono».
--
-- Pasó de verdad: Oscar tenía la 1002 en su perfil y ninguna credencial.
--
-- La ruta que asigna extensiones desde Configuración sí crea la credencial,
-- pero es UNA de las formas de escribir esa columna. También la escriben la
-- redención de invitaciones, el alta directa de usuarios y cualquier arreglo
-- hecho a mano en SQL. Confiar en que cada una se acuerde es confiar en que
-- nadie se olvide nunca.
--
-- Un disparador lo vuelve imposible: la credencial se crea sola, la escriba
-- quien la escriba.

-- ------------------------------------------------------------
-- 1. El disparador
-- ------------------------------------------------------------

create or replace function public.sincronizar_credencial_sip()
returns trigger
language plpgsql
security definer
-- `extensions` va en el camino, y no es un detalle: pgcrypto está instalado
-- ahí, así que con `set search_path = public` a secas la función compila sin
-- una queja y revienta en tiempo de ejecución con «gen_random_bytes does not
-- exist» — justo al asignar una extensión, que es lo único que hace.
--
-- Fijar el camino sigue siendo obligatorio: en una función `security definer`
-- heredarlo de quien la dispara permitiría anteponer un esquema con una
-- `gen_random_bytes` propia y elegir la clave SIP de otra persona.
set search_path = public, extensions
as $$
begin
  if new.sip_extension is not null then
    -- `on conflict do update` solo del `account_id`: la CLAVE no se toca.
    -- Regenerarla al cambiar de número desregistraría el teléfono que la
    -- persona tenga abierto, posiblemente en mitad de una llamada.
    insert into sip_credentials (user_id, account_id, password)
    values (new.user_id, new.account_id, encode(gen_random_bytes(18), 'hex'))
    on conflict (user_id) do update
      set account_id = excluded.account_id,
          updated_at = now();
  else
    -- Sin extensión no hay teléfono, y una credencial huérfana es una clave
    -- viva para un endpoint que ya no existe.
    delete from sip_credentials where user_id = new.user_id;
  end if;

  return new;
end;
$$;

alter function public.sincronizar_credencial_sip() owner to postgres;

drop trigger if exists trg_credencial_sip on profiles;
create trigger trg_credencial_sip
  after insert or update of sip_extension, account_id on profiles
  for each row
  execute function public.sincronizar_credencial_sip();

-- ------------------------------------------------------------
-- 2. Reparar lo que ya estaba roto
-- ------------------------------------------------------------
--
-- Todo perfil con extensión y sin credencial. Hoy es uno; el `insert select`
-- los arregla a todos y no vuelve a hacer nada en las siguientes corridas.

insert into sip_credentials (user_id, account_id, password)
select p.user_id, p.account_id, encode(gen_random_bytes(18), 'hex')
from profiles p
left join sip_credentials c on c.user_id = p.user_id
where p.sip_extension is not null
  and c.user_id is null;

-- Y al revés: credenciales que quedaron sin extensión. No rompen nada, pero
-- son claves vivas que no abren ninguna puerta, y conviene no acumularlas.
delete from sip_credentials c
using profiles p
where p.user_id = c.user_id
  and p.sip_extension is null;

comment on function public.sincronizar_credencial_sip() is
  'Mantiene sip_credentials en paso con profiles.sip_extension. Sin esto, '
  'asignar una extensión por un camino que no cree la credencial deja a la '
  'persona sin teléfono y sin ningún error que lo explique.';
