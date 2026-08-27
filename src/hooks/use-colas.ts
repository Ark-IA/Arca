'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ColaConMiembros } from '@/app/api/colas/route'

export type { ColaConMiembros }

/**
 * Las colas de la cuenta.
 *
 * Lo usan tres pantallas: el panel de Configuración que las administra, el
 * nodo de entrega de un flujo y el paso de una automatización. Los tres
 * necesitan la misma lista, así que la consulta vive en un solo sitio.
 */
export function useColas() {
  const [colas, setColas] = useState<ColaConMiembros[]>([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    try {
      const r = await fetch('/api/colas', { cache: 'no-store' })
      if (!r.ok) return
      const json = (await r.json()) as { colas?: ColaConMiembros[] }
      setColas(json.colas ?? [])
    } catch {
      // Silencio: sin colas, los selectores muestran su estado vacío y el
      // resto del formulario sigue funcionando.
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  return { colas, cargando, recargar }
}

/**
 * ¿Le corresponde a esta persona esta conversación?
 *
 * Tres casos, y el tercero es el que importa:
 *
 *   1. Está a su nombre.
 *   2. Espera en una cola que atiende.
 *   3. NO ESTÁ EN NINGUNA COLA.
 *
 * El tercero podría parecer que sobra, y esconderlo sería el error caro: una
 * conversación sin encolar es la de alguien que acaba de escribir y a quien
 * ningún flujo derivó todavía. Si no la ve nadie porque no es «de nadie», el
 * cliente nuevo se queda esperando en silencio. Sin dueño quiere decir de
 * todos, no de ninguno.
 *
 * Lo que sí se oculta: lo que está a nombre de otra persona, y lo que espera
 * en una cola ajena.
 */
export function esMia(
  conversacion: { cola_id?: string | null; assigned_agent_id?: string | null },
  usuarioId: string | null | undefined,
  misColas: Set<string>,
): boolean {
  if (usuarioId && conversacion.assigned_agent_id === usuarioId) return true
  if (conversacion.assigned_agent_id) return false
  if (!conversacion.cola_id) return true
  return misColas.has(conversacion.cola_id)
}

/** Las colas en las que está esta persona. */
export function colasDe(
  colas: ColaConMiembros[],
  usuarioId: string | null | undefined,
): Set<string> {
  if (!usuarioId) return new Set()
  return new Set(
    colas.filter((c) => c.miembros.some((m) => m.user_id === usuarioId)).map((c) => c.id),
  )
}

/** Clases del punto de color, por nombre de color de la cola. */
export const COLOR_DE_COLA: Record<string, string> = {
  slate: 'bg-slate-400',
  blue: 'bg-blue-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  violet: 'bg-violet-400',
  rose: 'bg-rose-400',
  cyan: 'bg-cyan-400',
}
