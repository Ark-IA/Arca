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
