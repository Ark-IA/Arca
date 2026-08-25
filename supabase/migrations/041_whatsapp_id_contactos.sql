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
-- Contactos que ya quedaron rotos
-- ============================================================
--
-- Los creados antes de esta migracion tienen phone = '' y ningun
-- identificador: son inalcanzables. No se pueden reparar desde aqui porque
-- el wa_id vive en el webhook, no en la base; se rellenan solos en cuanto
-- ese contacto vuelva a escribir.
--
-- Lo que si conviene es dejar el telefono en NULL en vez de cadena vacia:
-- '' se ve como "tiene telefono y esta en blanco", y NULL dice la verdad,
-- que es "no tiene". El indice unico de phone_normalized ya excluye '',
-- asi que este cambio no puede provocar colisiones.
update contacts set phone = null where phone = '';
