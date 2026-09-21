/**
 * Las conexiones de la cuenta: las líneas de WhatsApp, las páginas de
 * Facebook y las cuentas de Instagram, todas en una lista.
 *
 * Esta ruta NO conecta nada — para eso están `/api/whatsapp/config` y
 * `/api/meta/conexiones`, cada una con las credenciales y las
 * comprobaciones de su canal. Acá se administra lo que la operación decide
 * sobre una conexión ya conectada: cómo se llama, con qué prompt responde
 * el agente, si el agente responde, y a qué cola entran sus conversaciones.
 *
 * Se separó así porque son dos preguntas de vida distinta: las credenciales
 * se tocan una vez y se olvidan; el prompt y la cola se ajustan seguido y
 * los cambia gente que no debería estar cerca de un token.
 */

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export const dynamic = 'force-dynamic'

/** Lo que la pantalla necesita de cada conexión. Sin tokens, nunca. */
const COLUMNAS =
  'id, channel, external_id, name, status, last_error, connected_at, system_prompt, ai_enabled, cola_id, orden'

export async function GET() {
  let accountId: string
  try {
    ;({ accountId } = await requireRole('admin'))
  } catch (e) {
    return toErrorResponse(e)
  }

  const db = supabaseAdmin()

  const { data, error } = await db
    .from('channel_connections')
    .select(COLUMNAS)
    .eq('account_id', accountId)
    .order('channel', { ascending: true })
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[conexiones] no se pudieron leer:', error.message)
    return NextResponse.json({ error: 'No se pudieron leer las conexiones' }, { status: 500 })
  }

  // Cuántas conversaciones atiende cada una. Es el dato que contesta «¿esta
  // línea sigue en uso?» antes de borrarla, que es cuando más caro sale
  // equivocarse.
  const { data: conversaciones } = await db
    .from('conversations')
    .select('connection_id')
    .eq('account_id', accountId)
    .not('connection_id', 'is', null)

  const cuenta = new Map<string, number>()
  for (const c of conversaciones ?? []) {
    const k = (c as { connection_id: string }).connection_id
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }

  return NextResponse.json({
    conexiones: (data ?? []).map((c) => ({
      ...c,
      conversaciones: cuenta.get((c as { id: string }).id) ?? 0,
    })),
  })
}

/**
 * PATCH — cambiar los ajustes de una conexión.
 *
 * Solo se tocan los campos que vengan en el cuerpo. Un PATCH que manda
 * únicamente `{ ai_enabled: false }` no debe borrar el prompt de paso, que
 * es justo lo que pasaría si se escribieran todos los campos con lo que
 * trajera el formulario.
 */
export async function PATCH(request: Request) {
  let accountId: string
  try {
    ;({ accountId } = await requireRole('admin'))
  } catch (e) {
    return toErrorResponse(e)
  }

  let cuerpo: {
    id?: string
    name?: string | null
    system_prompt?: string | null
    ai_enabled?: boolean
    cola_id?: string | null
  }
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido' }, { status: 400 })
  }

  if (!cuerpo.id) {
    return NextResponse.json({ error: 'Falta el id de la conexion' }, { status: 400 })
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('name' in cuerpo) {
    const nombre = cuerpo.name?.trim()
    if (!nombre) {
      return NextResponse.json(
        { error: 'La conexion necesita un nombre para poder distinguirla.' },
        { status: 400 },
      )
    }
    cambios.name = nombre
  }

  if ('system_prompt' in cuerpo) {
    // Vacío se guarda como nulo, no como cadena vacía: nulo significa «usa
    // el de la cuenta» y la cadena vacía significaría «responde sin
    // instrucciones», que no es lo que quiso decir quien borró el campo.
    const prompt = cuerpo.system_prompt?.trim()
    cambios.system_prompt = prompt ? prompt : null
  }

  if ('ai_enabled' in cuerpo) {
    cambios.ai_enabled = !!cuerpo.ai_enabled
  }

  if ('cola_id' in cuerpo) {
    const cola = cuerpo.cola_id?.trim() || null
    if (cola) {
      // Que la cola sea de esta cuenta. Sin esta comprobación, conocer el
      // identificador de una cola ajena bastaría para mandarle las
      // conversaciones de otra organización.
      const { data: existe } = await supabaseAdmin()
        .from('colas')
        .select('id')
        .eq('id', cola)
        .eq('account_id', accountId)
        .maybeSingle()
      if (!existe) {
        return NextResponse.json({ error: 'Esa cola no existe' }, { status: 400 })
      }
    }
    cambios.cola_id = cola
  }

  const { error } = await supabaseAdmin()
    .from('channel_connections')
    .update(cambios)
    .eq('id', cuerpo.id)
    .eq('account_id', accountId)

  if (error) {
    console.error('[conexiones] no se pudo guardar:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
