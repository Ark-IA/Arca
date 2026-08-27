/**
 * Registro de llamadas.
 *
 *   POST  — abre el registro cuando empieza la llamada.
 *   PATCH — lo cierra con el desenlace.
 *
 * Se escribe desde el navegador y no desde Asterisk a proposito: el navegador
 * es quien sabe a que contacto del CRM corresponde el numero marcado. Asterisk
 * solo ve digitos.
 *
 * Se abre el registro AL EMPEZAR y no al terminar. Si se guardara solo al
 * final, cada llamada que termina con la pestaña cerrada o con el portatil sin
 * bateria desapareceria -- y esas son justo las que interesa revisar.
 */

import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { anotarEnLinea } from '@/lib/registros/linea-de-tiempo'

export const dynamic = 'force-dynamic'

const ESTADOS = [
  'ringing',
  'answered',
  'busy',
  'failed',
  'no_answer',
  'completed',
  'canceled',
] as const
type Estado = (typeof ESTADOS)[number]

function esEstado(v: unknown): v is Estado {
  return typeof v === 'string' && (ESTADOS as readonly string[]).includes(v)
}

export async function POST(request: Request) {
  try {
    // Cualquier miembro, incluido un observador.
    //
    // El telefono esta disponible para todos los roles, y este registro no
    // es contenido que se edite: es la constancia de una llamada que ya
    // ocurrio. Exigir `agent` dejaba a un observador pudiendo descolgar y
    // sin poder dejar rastro -- la llamada pasaba y no quedaba en ninguna
    // parte, que para revisar despues es peor que no haber podido llamar.
    const ctx = await getCurrentAccount()
    const cuerpo = (await request.json().catch(() => null)) as {
      direction?: unknown
      to_number?: unknown
      from_number?: unknown
      contact_id?: unknown
      extension?: unknown
    } | null

    const direction = cuerpo?.direction === 'inbound' ? 'inbound' : 'outbound'

    const { data, error } = await supabaseAdmin()
      .from('call_logs')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        contact_id: typeof cuerpo?.contact_id === 'string' ? cuerpo.contact_id : null,
        direction,
        to_number: typeof cuerpo?.to_number === 'string' ? cuerpo.to_number : null,
        from_number: typeof cuerpo?.from_number === 'string' ? cuerpo.from_number : null,
        extension: typeof cuerpo?.extension === 'string' ? cuerpo.extension : null,
        status: 'ringing',
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[telefonia] no se pudo abrir el registro:', error?.message)
      return NextResponse.json({ error: 'No se pudo registrar la llamada' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request) {
  try {
    // Cualquier miembro, incluido un observador.
    //
    // El telefono esta disponible para todos los roles, y este registro no
    // es contenido que se edite: es la constancia de una llamada que ya
    // ocurrio. Exigir `agent` dejaba a un observador pudiendo descolgar y
    // sin poder dejar rastro -- la llamada pasaba y no quedaba en ninguna
    // parte, que para revisar despues es peor que no haber podido llamar.
    const ctx = await getCurrentAccount()
    const cuerpo = (await request.json().catch(() => null)) as {
      id?: unknown
      status?: unknown
      answered?: unknown
    } | null

    if (typeof cuerpo?.id !== 'string' || !esEstado(cuerpo.status)) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const db = supabaseAdmin()

    // Se lee la fila ANTES de tocarla: hace falta el contacto y la dirección
    // para poder anotarla en la línea de tiempo, y después del update ya no
    // se sabría cuál era el estado anterior.
    const { data: previa } = await db
      .from('call_logs')
      .select('contact_id, direction, to_number, from_number, status')
      .eq('id', cuerpo.id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    const cambios: Record<string, unknown> = { status: cuerpo.status }
    if (cuerpo.answered === true) cambios.answered_at = new Date().toISOString()
    // Todo estado que no sea 'contestada' o 'sonando' es un final.
    if (cuerpo.status !== 'ringing' && cuerpo.status !== 'answered') {
      cambios.ended_at = new Date().toISOString()
    }

    // El filtro por cuenta no es decorativo: sin el, conocer el id de una
    // llamada ajena bastaria para reescribir su desenlace.
    const { error } = await db
      .from('call_logs')
      .update(cambios)
      .eq('id', cuerpo.id)
      .eq('account_id', ctx.accountId)

    if (error) {
      console.error('[telefonia] no se pudo cerrar el registro:', error.message)
      return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 })
    }

    // Solo se anota el DESENLACE, no cada cambio de estado: una llamada pasa
    // por 'ringing' y 'answered' antes de terminar, y anotar los tres dejaria
    // tres lineas en la ficha para una sola llamada.
    if (
      previa?.contact_id &&
      cuerpo.status !== 'ringing' &&
      cuerpo.status !== 'answered'
    ) {
      const entrante = previa.direction === 'inbound'
      const contestada = cuerpo.status === 'completed'
      void anotarEnLinea(db, {
        accountId: ctx.accountId,
        userId: ctx.userId,
        tipo: 'contact',
        registroId: previa.contact_id as string,
        eventType: 'call',
        title: entrante
          ? contestada
            ? 'Llamada recibida'
            : 'Llamada perdida'
          : contestada
            ? 'Llamada realizada'
            : 'Llamada sin respuesta',
        description: (entrante ? previa.from_number : previa.to_number) as string | null,
        metadata: { direction: previa.direction, status: cuerpo.status },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
