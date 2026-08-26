/**
 * PUT / DELETE  /api/account/members/[userId]/sip
 *
 * Asignar o quitarle la extension de Asterisk a un miembro del equipo.
 * Solo administradores.
 *
 * Se escribe con la clave de servicio y no con la sesion de quien llama:
 * `sip_credentials` no tiene politica de escritura a proposito (ver la
 * migracion 045), justamente para que la unica via sea esta.
 */

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { esExtensionValida } from '@/lib/telefonia/sip'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** 36 caracteres hexadecimales. Nadie la escribe a mano: la usa el navegador. */
function clavaSip(): string {
  return randomBytes(18).toString('hex')
}

/**
 * Comprueba que el usuario objetivo pertenece a la cuenta de quien llama.
 *
 * Sin esto, un administrador podria asignarle una extension a cualquier
 * usuario del sistema conociendo su identificador.
 */
async function pertenece(userId: string, accountId: string) {
  const { data } = await supabaseAdmin()
    .from('profiles')
    .select('user_id, account_id, sip_extension')
    .eq('user_id', userId)
    .maybeSingle()
  return data && data.account_id === accountId ? data : null
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole('admin')

    const limite = checkRateLimit(`admin:sip:${ctx.userId}`, RATE_LIMITS.adminAction)
    if (!limite.success) return rateLimitResponse(limite)

    const { userId } = await params
    const cuerpo = (await request.json().catch(() => null)) as
      | { extension?: unknown }
      | null

    const extension = typeof cuerpo?.extension === 'string' ? cuerpo.extension.trim() : ''
    if (!esExtensionValida(extension)) {
      return NextResponse.json(
        { error: 'La extensión tiene que ser un número de 3 a 6 dígitos.' },
        { status: 400 },
      )
    }

    const perfil = await pertenece(userId, ctx.accountId)
    if (!perfil) {
      return NextResponse.json({ error: 'Esa persona no está en tu cuenta.' }, { status: 404 })
    }

    const db = supabaseAdmin()

    // Se comprueba antes de escribir para poder decir QUIEN la tiene. El
    // indice unico tambien lo impediria, pero el error de Postgres no sirve
    // para mostrarselo a nadie.
    const { data: ocupada } = await db
      .from('profiles')
      .select('user_id, full_name, email')
      .eq('account_id', ctx.accountId)
      .eq('sip_extension', extension)
      .neq('user_id', userId)
      .maybeSingle()

    if (ocupada) {
      const quien = ocupada.full_name || ocupada.email || 'otro miembro'
      return NextResponse.json(
        { error: `La extensión ${extension} ya es de ${quien}.` },
        { status: 409 },
      )
    }

    const { error: errPerfil } = await db
      .from('profiles')
      .update({ sip_extension: extension })
      .eq('user_id', userId)

    if (errPerfil) {
      console.error('[sip] no se pudo guardar la extensión:', errPerfil.message)
      return NextResponse.json({ error: 'No se pudo guardar la extensión.' }, { status: 500 })
    }

    // La clave se genera de nuevo solo si no habia. Regenerarla en cada
    // cambio de numero desregistraria el telefono que la persona tenga
    // abierto en ese momento, en mitad de una llamada.
    const { data: yaTiene } = await db
      .from('sip_credentials')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!yaTiene) {
      const { error: errCred } = await db.from('sip_credentials').insert({
        user_id: userId,
        account_id: ctx.accountId,
        password: clavaSip(),
      })
      if (errCred) {
        console.error('[sip] no se pudo crear la clave:', errCred.message)
        return NextResponse.json(
          { error: 'Se guardó la extensión pero no la clave. Volvé a intentarlo.' },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ ok: true, extension })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole('admin')
    const { userId } = await params

    const perfil = await pertenece(userId, ctx.accountId)
    if (!perfil) {
      return NextResponse.json({ error: 'Esa persona no está en tu cuenta.' }, { status: 404 })
    }

    const db = supabaseAdmin()
    await db.from('profiles').update({ sip_extension: null }).eq('user_id', userId)
    // La clave se borra junto con la extension: dejarla seria dejar una
    // credencial valida para un endpoint que ya no existe.
    await db.from('sip_credentials').delete().eq('user_id', userId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
