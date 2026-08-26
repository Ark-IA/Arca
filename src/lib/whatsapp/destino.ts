/**
 * A donde se le manda un mensaje a un contacto.
 *
 * Desde que Meta permite nombres de usuario, un contacto de WhatsApp puede no
 * tener telefono. Antes se asumia que siempre lo tenia, y el resultado era que
 * los contactos por nombre de usuario desaparecian en silencio: el envio
 * individual devolvia "Contact phone number not found" y el masivo directamente
 * los descartaba de la lista antes de llamar a la API, dejandolos en estado
 * "pendiente" para siempre -- ni enviados ni fallidos, asi que ni siquiera
 * aparecian en el reintento.
 *
 * Esta funcion es el unico lugar donde se decide el destino, para que el envio
 * individual, el masivo, su reintento y los flujos no puedan volver a
 * discrepar entre si.
 */

import { sanitizePhoneForMeta, isValidE164 } from './phone-utils'
import { esBsuid } from './bsuid'

/** Lo minimo que hace falta saber de un contacto para poder escribirle. */
export interface ContactoDireccionable {
  phone?: string | null
  whatsapp_user_id?: string | null
  whatsapp_id?: string | null
}

export interface Destino {
  /** El valor que va en `to` o en `recipient`, ya normalizado. */
  valor: string
  /** `telefono` acepta reintento con variantes; `usuario` no. */
  tipo: 'telefono' | 'usuario'
}

/**
 * Prefiere el telefono cuando lo hay y es valido.
 *
 * El orden importa: un contacto puede tener las dos cosas -- llego por nombre
 * de usuario y despues alguien le cargo el telefono a mano. En ese caso el
 * telefono es el destino mas estable, porque el identificador de usuario esta
 * atado al negocio que lo emitio.
 */
export function resolverDestino(
  contacto: ContactoDireccionable | null | undefined,
): Destino | null {
  if (!contacto) return null

  const telefono = contacto.phone ? sanitizePhoneForMeta(contacto.phone) : ''
  if (telefono !== '' && isValidE164(telefono)) {
    return { valor: telefono, tipo: 'telefono' }
  }

  const usuario = (contacto.whatsapp_user_id || contacto.whatsapp_id || '').trim()
  if (usuario !== '') {
    return { valor: usuario, tipo: 'usuario' }
  }

  return null
}

/**
 * Acepta un destino que ya viene resuelto desde el cliente.
 *
 * El masivo manda al servidor una lista de destinos ya elegidos, y el servidor
 * no puede confiar en ella a ciegas: valida que sea un telefono E.164 o un
 * identificador de usuario, y rechaza cualquier otra cosa.
 */
export function validarDestinoEntrante(valor: string): Destino | null {
  const limpio = valor.trim()
  if (limpio === '') return null

  if (esBsuid(limpio)) return { valor: limpio, tipo: 'usuario' }

  const telefono = sanitizePhoneForMeta(limpio)
  if (telefono !== '' && isValidE164(telefono)) {
    return { valor: telefono, tipo: 'telefono' }
  }

  return null
}

/** Texto para mostrarle a la persona cuando un contacto no tiene a donde. */
export const SIN_DESTINO =
  'El contacto no tiene ni teléfono válido ni nombre de usuario de WhatsApp.'
