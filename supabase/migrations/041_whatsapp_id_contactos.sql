-- ============================================================
-- Identificador de WhatsApp en los contactos
-- ============================================================
--
-- Meta habilito nombres de usuario en WhatsApp. Desde entonces un remitente
-- puede llegar SIN numero de telefono: el webhook trae `contacts[0].wa_id`
-- con un identificador tipo "CO.4509733672618188" y el campo `from` puede
-- venir vacio.
--
-- El codigo asumia que todo contacto tiene telefono. Con un usuario de ese
-- tipo, el contacto se creaba con phone = '' y responderle fallaba con
-- "Contact phone number not found" -- un mensaje que no dice que el problema
-- es que ese cliente no tiene numero, no que falte configurar algo.
--
-- La solucion no es inventar un telefono: es guardar el identificador tal
-- como Meta lo manda y usarlo para responder cuando no hay numero. El
-- telefono sigue siendo el dato preferido cuando existe, porque es el que
-- entiende el resto del mundo (llamar, exportar, cruzar con otros sistemas).

alter table contacts add column if not exists whatsapp_id text;

comment on column contacts.whatsapp_id is
  'wa_id tal como lo envia Meta. Puede ser un telefono en digitos o un nombre de usuario (ej. CO.4509733672618188). Es la direccion de respuesta cuando phone esta vacio.';

-- Unico por cuenta: el mismo wa_id no puede pertenecer a dos contactos de la
-- misma organizacion. Parcial, porque los contactos cargados a mano no lo
-- tienen y no deben chocar entre si.
create unique index if not exists idx_contacts_account_whatsapp_id
  on contacts (account_id, whatsapp_id)
  where whatsapp_id is not null and whatsapp_id <> '';

-- ============================================================
-- El telefono deja de ser obligatorio
-- ============================================================
--
-- La tabla nacio con `phone TEXT NOT NULL` porque en su momento todo
-- contacto de WhatsApp tenia numero. Con los nombres de usuario de Meta esa
-- premisa dejo de ser cierta, y la constraint obliga a guardar '' -- que es
-- peor que NULL: se ve como "tiene telefono y esta en blanco", y hace que
-- toda validacion del tipo `if (!phone)` se comporte distinto segun si el
-- dato viene de la base o de un formulario.
--
-- Se afloja la columna y se normaliza lo ya guardado. El indice unico de
-- phone_normalized excluye '' desde la migracion 022, asi que pasar esas
-- filas a NULL no puede provocar colisiones.
alter table contacts alter column phone drop not null;
update contacts set phone = null where phone = '';

-- Al menos una via de contacto: sin telefono ni wa_id el contacto no es
-- alcanzable por ningun canal, y guardarlo solo esconde el problema hasta
-- que alguien intenta responderle.
alter table contacts drop constraint if exists contacts_via_de_contacto;
alter table contacts add constraint contacts_via_de_contacto
  check (
    (phone is not null and phone <> '')
    or (whatsapp_id is not null and whatsapp_id <> '')
    or (email is not null and email <> '')
  ) not valid;
-- `not valid` a proposito: valida las filas NUEVAS sin rechazar las viejas
-- que ya quedaron sin via de contacto. Se pueden reparar despues sin que la
-- migracion falle a mitad de camino en una instalacion con datos.
