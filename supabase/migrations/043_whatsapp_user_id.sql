-- ============================================================
-- Los DOS identificadores que manda Meta
-- ============================================================
--
-- El webhook de WhatsApp trae dos campos distintos para el mismo contacto:
--
--   contacts[0].wa_id    = "1777593217005660"      (identidad numerica)
--   contacts[0].user_id  = "CO.1777593217005660"   (nombre de usuario, con
--                                                   prefijo de pais)
--
-- Y en los avisos de estado los repite como `recipient_id` y
-- `recipient_user_id`.
--
-- La migracion 041 guardaba uno solo, mezclando ambos en `whatsapp_id`
-- segun cual llegara primero. Eso hacia imposible responder de forma
-- consistente: para un contacto quedaba guardada la forma numerica y para
-- otro la forma con prefijo, y solo una de las dos es la que Meta espera
-- en el campo `to` para cada caso.
--
-- Ahora cada forma tiene su columna. Al responder se elige asi:
--   1. el telefono, si el contacto tiene uno de verdad
--   2. el user_id (con prefijo), que es la direccion de los contactos que
--      escriben con nombre de usuario
--   3. el wa_id como ultimo recurso

alter table contacts add column if not exists whatsapp_user_id text;

comment on column contacts.whatsapp_user_id is
  'contacts[].user_id de Meta: el nombre de usuario con prefijo de pais (ej. CO.1777593217005660). Es la direccion de respuesta preferida cuando el contacto no tiene telefono.';

comment on column contacts.whatsapp_id is
  'contacts[].wa_id de Meta: la identidad numerica sin prefijo. Puede coincidir con el telefono cuando el contacto si tiene numero.';

create unique index if not exists idx_contacts_account_whatsapp_user_id
  on contacts (account_id, whatsapp_user_id)
  where whatsapp_user_id is not null and whatsapp_user_id <> '';

-- Los contactos que ya tienen un identificador con prefijo guardado en la
-- columna equivocada se pasan a la nueva. Se reconocen por la forma:
-- dos letras, un punto y digitos.
update contacts
   set whatsapp_user_id = whatsapp_id
 where whatsapp_user_id is null
   and whatsapp_id ~ '^[A-Z]{2}\.[0-9]+$';

-- Y a esos mismos se les deja tambien la forma numerica en whatsapp_id,
-- que es lo que Meta manda en `wa_id` y en `recipient_id`. Sin esto, los
-- avisos de estado no encuentran a quien corresponden.
update contacts
   set whatsapp_id = substring(whatsapp_user_id from '[0-9]+$')
 where whatsapp_user_id is not null
   and whatsapp_id ~ '^[A-Z]{2}\.[0-9]+$';

-- La restriccion de "al menos una via de contacto" tiene que contemplar
-- tambien la columna nueva.
alter table contacts drop constraint if exists contacts_via_de_contacto;
alter table contacts add constraint contacts_via_de_contacto
  check (
    (phone is not null and phone <> '')
    or (whatsapp_id is not null and whatsapp_id <> '')
    or (whatsapp_user_id is not null and whatsapp_user_id <> '')
    or (email is not null and email <> '')
  ) not valid;
