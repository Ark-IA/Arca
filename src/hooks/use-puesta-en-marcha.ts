'use client'

import { useCallback, useEffect, useState } from 'react'

import type { EstadoPuestaEnMarcha } from '@/app/api/puesta-en-marcha/route'

export type { EstadoPuestaEnMarcha }

/**
 * El estado de configuración de la cuenta, para la lista de puesta en marcha
 * y para el panel de disparador del editor de flujos.
 *
 * `recargar` existe porque la lista vive en pantallas que el usuario deja y
 * retoma: conecta WhatsApp en otra pestaña, vuelve, y el paso tiene que
 * tildarse sin obligarlo a recargar la página entera.
 */
export function usePuestaEnMarcha() {
  const [estado, setEstado] = useState<EstadoPuestaEnMarcha | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    try {
      const r = await fetch('/api/puesta-en-marcha', { cache: 'no-store' })
      if (!r.ok) return
      setEstado((await r.json()) as EstadoPuestaEnMarcha)
    } catch {
      // Silencio a propósito: esto decora la pantalla, no la sostiene. Si la
      // consulta falla, la lista no aparece y el usuario sigue navegando —
      // preferible a un cartel de error sobre un panel que funciona.
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  // Al volver a la pestaña se refresca: el camino normal es irse a conectar
  // un canal y volver, y encontrar el paso sin tildar da la impresión de que
  // no se guardó.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [recargar])

  return { estado, cargando, recargar }
}

/** Los canales conectados, en el orden en que se nombran al usuario. */
export function canalesConectados(estado: EstadoPuestaEnMarcha | null): string[] {
  if (!estado) return []
  const nombres: string[] = []
  if (estado.canales.whatsapp) nombres.push('WhatsApp')
  if (estado.canales.facebook) nombres.push('Facebook')
  if (estado.canales.instagram) nombres.push('Instagram')
  return nombres
}
