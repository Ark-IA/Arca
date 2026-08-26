/**
 * PATCH /api/ai/canales
 *
 * Cambia SOLO en qué bandejas contesta el agente.
 *
 * Existe aparte de `POST /api/ai/config` porque aquel exige el proveedor, el
 * modelo y la clave, y revalida las credenciales contra el proveedor cuando
 * algo cambia. Para marcar una casilla eso serían dos problemas: habría que
 * reenviar toda la configuración desde una pantalla que no la conoce, y cada
 * clic gastaría una llamada al proveedor.
 */

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const CANALES = ['whatsapp', 'facebook', 'instagram'] as const

export async function PATCH(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limite = checkRateLimit(`ai-canales:${userId}`, RATE_LIMITS.adminAction)
    if (!limite.success) return rateLimitResponse(limite)

    const cuerpo = (await request.json().catch(() => null)) as {
      auto_reply_channels?: unknown
    } | null

    if (!Array.isArray(cuerpo?.auto_reply_channels)) {
      return NextResponse.json(
        { error: 'auto_reply_channels tiene que ser una lista' },
        { status: 400 },
      )
    }

    // Se filtra contra los canales reales y se quitan repetidos. Confiar en
    // la restricción de la base para esto dejaría la validación en el sitio
    // equivocado: el error llegaría como un 500 sin explicación.
    const canales = [
      ...new Set(
        cuerpo.auto_reply_channels.filter(
          (c: unknown): c is string =>
            typeof c === 'string' && (CANALES as readonly string[]).includes(c),
        ),
      ),
    ]

    const { error } = await supabase
      .from('ai_configs')
      .update({ auto_reply_channels: canales })
      .eq('account_id', accountId)

    if (error) {
      console.error('[ai/canales] no se pudo guardar:', error.message)
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, auto_reply_channels: canales })
  } catch (err) {
    return toErrorResponse(err)
  }
}
