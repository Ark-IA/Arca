/**
 * Lista de bloqueo: a quién no se le escribe nunca.
 *
 * Esto NO es una comodidad de la interfaz. Alguien que pidió no recibir más
 * mensajes y los vuelve a recibir es un problema legal, no una molestia. Por
 * eso el filtro vive acá, en el camino del envío, y no en la pantalla que
 * arma la lista de destinatarios: una pantalla se puede saltar (la API
 * pública, una automatización, un flujo), el envío no.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { esBsuid } from './bsuid'
import { sanitizePhoneForMeta } from './phone-utils'

/** Motivo legible cuando se frena un envío. */
export const MENSAJE_BLOQUEADO =
  'Este contacto está en la lista de bloqueo: pidió no recibir más mensajes.'

/**
 * Los valores con los que hay que comparar un destino.
 *
 * Un mismo destinatario puede estar bloqueado de dos formas: por su teléfono
 * o por su identificador de usuario de WhatsApp. Se comprueban las dos.
 */
function clavesDe(destino: string): { kind: string; value: string }[] {
  const limpio = destino.trim()
  if (limpio === '') return []

  if (esBsuid(limpio)) {
    return [{ kind: 'whatsapp_user', value: limpio }]
  }

  const telefono = sanitizePhoneForMeta(limpio)
  const claves = [{ kind: 'phone', value: telefono || limpio }]
  // También se busca sin el '+': la lista pudo cargarse a mano de cualquiera
  // de las dos formas, y una coincidencia perdida acá deja pasar el mensaje.
  if (telefono.startsWith('+')) {
    claves.push({ kind: 'phone', value: telefono.slice(1) })
  } else if (telefono !== '') {
    claves.push({ kind: 'phone', value: `+${telefono}` })
  }
  return claves
}

/**
 * ¿Está bloqueado este destino?
 *
 * Ante un error de base devuelve `false` -- deja pasar el mensaje -- y lo
 * registra. Es la decisión menos mala: bloquear todos los envíos porque la
 * consulta de la lista falló convertiría un problema de infraestructura en
 * una caída total de la mensajería.
 */
export async function estaBloqueado(
  db: SupabaseClient,
  accountId: string,
  destino: string,
): Promise<boolean> {
  const claves = clavesDe(destino)
  if (claves.length === 0) return false

  const { data, error } = await db
    .from('blocklist')
    .select('id')
    .eq('account_id', accountId)
    .in('kind', [...new Set(claves.map((c) => c.kind))])
    .in('value', claves.map((c) => c.value))
    .limit(1)

  if (error) {
    console.error('[bloqueo] no se pudo consultar la lista:', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * Versión para lotes: devuelve el conjunto de destinos bloqueados de una lista.
 *
 * Un masivo de mil destinatarios con una consulta por cabeza serían mil idas a
 * la base solo para descartar a tres.
 */
export async function bloqueadosEntre(
  db: SupabaseClient,
  accountId: string,
  destinos: string[],
): Promise<Set<string>> {
  const bloqueados = new Set<string>()
  if (destinos.length === 0) return bloqueados

  // De cada destino salen una o dos claves; se guarda a qué destino original
  // corresponde cada una para poder devolverlos tal como llegaron.
  const porClave = new Map<string, string[]>()
  for (const d of destinos) {
    for (const { value } of clavesDe(d)) {
      const lista = porClave.get(value)
      if (lista) lista.push(d)
      else porClave.set(value, [d])
    }
  }

  const valores = [...porClave.keys()]
  const { data, error } = await db
    .from('blocklist')
    .select('value')
    .eq('account_id', accountId)
    .in('value', valores)

  if (error) {
    console.error('[bloqueo] no se pudo consultar la lista:', error.message)
    return bloqueados
  }

  for (const fila of (data ?? []) as { value: string }[]) {
    for (const d of porClave.get(fila.value) ?? []) bloqueados.add(d)
  }
  return bloqueados
}
