/**
 * El vínculo entre una nota / tarea / adjunto / evento y el registro del que
 * cuelga.
 *
 * La base guarda una columna por tipo de destino (`contact_id`, `company_id`,
 * `deal_id`) con exactamente una puesta, en vez de una pareja `(tipo, id)`.
 * El motivo está en la migración 047: una pareja no la puede verificar
 * Postgres — nada impediría guardar ('contact', <id de una empresa>) — y el
 * día que se borre ese registro el vínculo quedaría apuntando al vacío.
 *
 * Ese modelo es correcto para la base y torpe para el código, que sí quiere
 * hablar de `{tipo, id}`. Estas funciones traducen entre los dos, en un solo
 * sitio.
 */

import type { DestinoDeVinculo, TipoDeRegistro } from '@/types'

export const COLUMNA_POR_TIPO: Record<
  TipoDeRegistro,
  'contact_id' | 'company_id' | 'deal_id'
> = {
  contact: 'contact_id',
  company: 'company_id',
  deal: 'deal_id',
}

export const ETIQUETA_POR_TIPO: Record<TipoDeRegistro, string> = {
  contact: 'contacto',
  company: 'empresa',
  deal: 'negocio',
}

/** `{tipo, id}` → la fila que espera la base. */
export function aColumnas(tipo: TipoDeRegistro, id: string): DestinoDeVinculo {
  return { [COLUMNA_POR_TIPO[tipo]]: id }
}

/** La fila de la base → `{tipo, id}`, o `null` si viniera vacía. */
export function aDestino(
  fila: DestinoDeVinculo,
): { tipo: TipoDeRegistro; id: string } | null {
  if (fila.contact_id) return { tipo: 'contact', id: fila.contact_id }
  if (fila.company_id) return { tipo: 'company', id: fila.company_id }
  if (fila.deal_id) return { tipo: 'deal', id: fila.deal_id }
  return null
}
