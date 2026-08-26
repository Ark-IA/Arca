/**
 * Escribir en la línea de tiempo.
 *
 * Solo desde el servidor. La migración 047 le dio a `timeline_events` una
 * única política, la de SELECT: RLS deniega por defecto, así que el cliente
 * puede leerla y no puede tocarla. Se escribe con la clave de servicio, que
 * se salta RLS. Una línea de tiempo editable desde el navegador no sirve como
 * registro de nada.
 *
 * Nada de lo que hay acá puede hacer fallar la operación que lo dispara. Si no
 * se pudo anotar que se envió un mensaje, el mensaje igual se envió: perder la
 * anotación es malo, perder el mensaje es peor.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { COLUMNA_POR_TIPO } from './vinculos'
import type { TipoDeRegistro } from '@/types'

export interface EventoDeLinea {
  accountId: string
  /** Quién lo provocó. `null` cuando fue el sistema. */
  userId?: string | null
  tipo: TipoDeRegistro
  registroId: string
  /** Verbo. Texto libre a propósito: ver la migración 047. */
  eventType: string
  title: string
  description?: string | null
  metadata?: Record<string, unknown>
  /** Cuándo pasó, si no fue ahora. */
  occurredAt?: string
}

export async function anotarEnLinea(
  db: SupabaseClient,
  evento: EventoDeLinea,
): Promise<void> {
  try {
    const { error } = await db.from('timeline_events').insert({
      account_id: evento.accountId,
      user_id: evento.userId ?? null,
      event_type: evento.eventType,
      title: evento.title,
      description: evento.description ?? null,
      metadata: evento.metadata ?? {},
      occurred_at: evento.occurredAt ?? new Date().toISOString(),
      [COLUMNA_POR_TIPO[evento.tipo]]: evento.registroId,
    })
    if (error) {
      console.error('[linea-de-tiempo] no se pudo anotar:', error.message)
    }
  } catch (e) {
    // Ni siquiera se deja escapar la excepción: quien llama está en mitad de
    // enviar un mensaje o registrar una llamada.
    console.error('[linea-de-tiempo] error inesperado:', e)
  }
}

/** Recorte de un texto para que quepa en una línea de la ficha. */
export function resumir(texto: string | null | undefined, limite = 120): string | null {
  if (!texto) return null
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (limpio === '') return null
  return limpio.length <= limite ? limpio : `${limpio.slice(0, limite - 1)}…`
}
