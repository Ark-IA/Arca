-- ============================================================
-- Credenciales SIP: sacar la clave de `profiles`
-- ============================================================
--
-- La migracion 040 dejo `sip_password` dentro de `profiles`. Eso estaba mal:
-- las politicas de `profiles` permiten que cualquier miembro de la cuenta lea
-- las filas de sus companeros, asi que un agente podia leer la clave SIP de
-- otro, registrarse con su extension y contestar sus llamadas.
--
-- La extension SI se queda en `profiles`: no es un secreto, y el administrador
-- necesita verla en el listado del equipo para saber quien tiene cual.
-- La clave se muda a una tabla propia donde la unica politica de lectura es
-- "tu propia fila". Ni el administrador la lee por SQL: cuando la asigna, la
-- escribe el servidor con la clave de servicio.

create table if not exists sip_credentials (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  -- Se guarda en claro a proposito. El navegador tiene que presentarsela a
  -- Asterisk para registrarse, y Asterisk la necesita en su propio archivo de
  -- configuracion: cifrarla obligaria a descifrarla en los dos extremos con
  -- una clave que vive en el mismo servidor. Lo que si se hace es no dejarla
  -- al alcance de nadie mas que su dueño.
  password   text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_sip_credentials_cuenta on sip_credentials (account_id);

alter table sip_credentials enable row level security;

-- Una sola politica y solo de lectura. Escribir es tarea del servidor con la
-- clave de servicio, que se salta RLS: asi no hay forma de que un cliente
-- se cambie la clave a una que el ya conozca.
drop policy if exists sip_credentials_select_propia on sip_credentials;
create policy sip_credentials_select_propia on sip_credentials
  for select using (user_id = auth.uid());

grant select on sip_credentials to authenticated;
grant all    on sip_credentials to service_role;

-- Se arrastra lo que hubiera quedado de la 040 y se borra la columna vieja.
insert into sip_credentials (user_id, account_id, password)
select user_id, account_id, sip_password
from profiles
where sip_password is not null
on conflict (user_id) do nothing;

alter table profiles drop column if exists sip_password;

-- Extensiones que quedaron asignadas sin clave (asignadas a mano antes de que
-- existiera esta tabla). Sin clave el endpoint no se puede generar y el
-- telefono nunca se registraria, sin ningun error que lo explique.
insert into sip_credentials (user_id, account_id, password)
select p.user_id, p.account_id, encode(gen_random_bytes(18), 'hex')
from profiles p
where p.sip_extension is not null
on conflict (user_id) do nothing;


-- ============================================================
-- La extension se asigna al invitar, no despues
-- ============================================================
--
-- El alta de una persona en el CRM es un enlace de invitacion, asi que ese es
-- el momento en que se le asigna la extension. Queda guardada en la invitacion
-- y se copia al perfil cuando la persona entra.

alter table account_invitations add column if not exists sip_extension text;

alter table account_invitations drop constraint if exists account_invitations_sip_formato;
alter table account_invitations add constraint account_invitations_sip_formato
  check (sip_extension is null or sip_extension ~ '^[0-9]{3,6}$');

comment on column account_invitations.sip_extension is
  'Extension de Asterisk reservada para quien acepte esta invitacion.';


create or replace function public.redeem_invitation(
  p_token_hash TEXT
) returns UUID
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
  v_ext_libre BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  -- Extension reservada en la invitacion.
  --
  -- Si mientras la invitacion estaba pendiente alguien mas se quedo con ese
  -- numero, la persona entra SIN extension en vez de rebotar. Perder el
  -- telefono es un problema que el administrador arregla en dos clics; no
  -- poder entrar al CRM lo deja afuera del trabajo.
  IF v_inv.sip_extension IS NOT NULL THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE account_id = v_inv.account_id
        AND sip_extension = v_inv.sip_extension
    ) INTO v_ext_libre;

    IF v_ext_libre THEN
      UPDATE profiles
      SET sip_extension = v_inv.sip_extension
      WHERE user_id = v_caller_id;

      INSERT INTO sip_credentials (user_id, account_id, password)
      VALUES (v_caller_id, v_inv.account_id, encode(gen_random_bytes(18), 'hex'))
      ON CONFLICT (user_id) DO UPDATE
        SET account_id = EXCLUDED.account_id,
            password   = EXCLUDED.password,
            updated_at = NOW();
    END IF;
  END IF;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

alter function public.redeem_invitation(TEXT) owner to postgres;
revoke all on function public.redeem_invitation(TEXT) from public;
grant execute on function public.redeem_invitation(TEXT) to authenticated;


-- ============================================================
-- Vista para el generador de configuracion de Asterisk
-- ============================================================
--
-- Existe para que el script del servidor no tenga que saber como estan
-- repartidas las columnas entre `profiles` y `sip_credentials`. Solo la lee
-- el usuario postgres desde el propio servidor; no se expone por la API.

create or replace view sip_endpoints as
select
  p.user_id,
  p.account_id,
  p.sip_extension                       as extension,
  c.password,
  coalesce(nullif(p.full_name, ''), p.email, p.sip_extension) as nombre,
  -- El nombre del endpoint tiene que ser unico en toda la central, pero la
  -- extension solo es unica dentro de la cuenta. Anteponer un trozo del
  -- identificador de cuenta permite que dos organizaciones usen la 1001 sin
  -- que Asterisk las confunda.
  replace(substring(p.account_id::text, 1, 8), '-', '') as prefijo
from profiles p
join sip_credentials c on c.user_id = p.user_id
where p.sip_extension is not null;

revoke all on sip_endpoints from anon, authenticated;
