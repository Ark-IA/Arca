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
 * Dos casos, y solo dos: está a su nombre, o espera en una cola que atiende.
 *
 * Una versión anterior contaba también las que no estaban en ninguna cola,
 * con el argumento de que «sin dueño quiere decir de todos». El aislamiento
 * por asignación (migración 061) descartó esa lectura: sin asignación y sin
 * cola, un asesor no ve nada. La regla vive ahora en las políticas de la
 * base, y esta función tiene que decir exactamente lo mismo — si dijera de
 * más, el filtro contaría conversaciones que el servidor nunca devuelve y la
 * bandeja mostraría totales que no cuadran con lo que se ve.
 *
 * Para quien administra sigue siendo un filtro de comodidad: el servidor le
 * devuelve todo, y esto le separa lo suyo del resto.
 */
export function esMia(
  conversacion: { cola_id?: string | null; assigned_agent_id?: string | null },
  usuarioId: string | null | undefined,
  misColas: Set<string>,
): boolean {
  if (usuarioId && conversacion.assigned_agent_id === usuarioId) return true
  if (conversacion.assigned_agent_id) return false
  if (!conversacion.cola_id) return false
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
