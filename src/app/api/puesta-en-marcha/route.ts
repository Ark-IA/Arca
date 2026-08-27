/**
 * GET /api/puesta-en-marcha
 *
 * El estado real de la configuración de la cuenta, en un solo viaje.
 *
 * Lo consume la lista de puesta en marcha del panel y el panel de disparador
 * del editor de flujos. Es un endpoint y no cinco consultas desde el
 * navegador por dos motivos:
 *
 *   1. La lista tiene cinco pasos. Cinco consultas sueltas se resuelven en
 *      cinco momentos distintos, así que el usuario ve la lista tildándose
 *      sola de a pedazos, como si el sistema estuviera dudando.
 *   2. Ninguno de estos datos es del usuario: son de la CUENTA. Resolverlos
 *      en el servidor con el contexto de cuenta ya cargado evita depender de
 *      que cada tabla tenga la política de lectura correcta para cada rol.
 *
 * Es de solo lectura y no revela ningún secreto: dice SI hay una credencial,
 * nunca cuál.
 */

import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export interface EstadoPuestaEnMarcha {
  canales: {
    whatsapp: boolean
    facebook: boolean
    instagram: boolean
    /** Cuántos hay conectados. El paso 1 se tilda con uno solo. */
    conectados: number
  }
  flujos: {
    total: number
    /** Hay un flujo ACTIVO que atiende el primer mensaje: la bienvenida. */
    bienvenida: boolean
    /** Hay flujos, pero ninguno activo. El fallo silencioso más común. */
    soloBorradores: boolean
  }
  automatizaciones: { total: number; activas: number }
  agenteIa: { configurado: boolean; activo: boolean }
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()

    const [whatsapp, meta, flujos, automatizaciones, ia] = await Promise.all([
      supabase
        .from('whatsapp_config')
        .select('status')
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase
        .from('channel_connections')
        .select('channel, status')
        .eq('account_id', accountId)
        .in('channel', ['facebook', 'instagram']),
      supabase
        .from('flows')
        .select('status, trigger_type')
        .eq('account_id', accountId),
      supabase
        .from('automations')
        .select('is_active')
        .eq('account_id', accountId),
      supabase
        .from('ai_configs')
        .select('is_active, auto_reply_enabled, api_key')
        .eq('account_id', accountId)
        .maybeSingle(),
    ])

    const conexionesMeta = (meta.data ?? []) as {
      channel: string
      status: string
    }[]
    const conectado = (canal: string) =>
      conexionesMeta.some((c) => c.channel === canal && c.status === 'connected')

    const canales = {
      whatsapp: whatsapp.data?.status === 'connected',
      facebook: conectado('facebook'),
      instagram: conectado('instagram'),
      conectados: 0,
    }
    canales.conectados = [canales.whatsapp, canales.facebook, canales.instagram].filter(
      Boolean,
    ).length

    const filasFlujos = (flujos.data ?? []) as {
      status: string
      trigger_type: string
    }[]
    const activos = filasFlujos.filter((f) => f.status === 'active')

    const filasAutomatizaciones = (automatizaciones.data ?? []) as {
      is_active: boolean
    }[]

    const estado: EstadoPuestaEnMarcha = {
      canales,
      flujos: {
        total: filasFlujos.length,
        // Activo Y de primer mensaje. Las dos condiciones importan: un flujo
        // de bienvenida en borrador no saluda a nadie, y ese es exactamente
        // el caso que la lista tiene que dejar en evidencia.
        bienvenida: activos.some((f) => f.trigger_type === 'first_inbound_message'),
        soloBorradores: filasFlujos.length > 0 && activos.length === 0,
      },
      automatizaciones: {
        total: filasAutomatizaciones.length,
        activas: filasAutomatizaciones.filter((a) => a.is_active).length,
      },
      agenteIa: {
        // Se informa la EXISTENCIA de la credencial, jamás su contenido.
        configurado: Boolean(ia.data?.api_key),
        activo: Boolean(ia.data?.is_active && ia.data?.auto_reply_enabled),
      },
    }

    return NextResponse.json(estado)
  } catch (err) {
    return toErrorResponse(err)
  }
}
