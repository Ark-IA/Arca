/**
 * Alta y baja de cuentas de Facebook Messenger e Instagram.
 *
 * El token viaja en claro desde el navegador (por HTTPS) y se cifra ACA,
 * en el servidor, antes de tocar la base. Cifrarlo en el navegador seria
 * teatro: la clave tendria que estar en el bundle y cualquiera podria
 * leerla.
 */

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { encrypt } from '@/lib/whatsapp/encryption'
import { perfilDeUsuario } from '@/lib/meta/mensajeria'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let accountId: string
  let userId: string
  try {
    // 'admin' y no 'agent': conectar una cuenta cambia por donde entra y
    // sale la comunicacion de toda la organizacion.
    const ctx = await requireRole('admin')
    accountId = ctx.accountId
    userId = ctx.userId
  } catch (e) {
    return toErrorResponse(e)
  }

  let cuerpo: {
    channel?: string
    external_id?: string
    name?: string | null
    access_token?: string
  }
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido' }, { status: 400 })
  }

  const { channel, external_id, name, access_token } = cuerpo

  if (channel !== 'facebook' && channel !== 'instagram') {
    return NextResponse.json({ error: 'Canal no soportado' }, { status: 400 })
  }
  if (!external_id?.trim() || !access_token?.trim()) {
    return NextResponse.json(
      { error: 'Hacen falta el identificador y el token' },
      { status: 400 },
    )
  }

  // Se comprueba el token contra Meta ANTES de guardarlo. Guardar sin
  // probar deja la pantalla diciendo "Conectado" mientras los mensajes no
  // llegan, y el error aparece dias despues sin nada que lo explique.
  const prueba = await fetch(
    `https://graph.facebook.com/v23.0/${external_id.trim()}?fields=id,name`,
    { headers: { Authorization: `Bearer ${access_token.trim()}` } },
  )
  const datosPrueba = await prueba.json().catch(() => ({}))
  if (!prueba.ok) {
    const motivo = datosPrueba?.error?.message ?? `Meta respondio ${prueba.status}`
    return NextResponse.json(
      { error: `Meta rechazo las credenciales: ${motivo}` },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()
  const { error } = await db
    .from('channel_connections')
    .upsert(
      {
        account_id: accountId,
        user_id: userId,
        channel,
        external_id: external_id.trim(),
        // Si Meta devolvio el nombre real, se prefiere al que escribio la
        // persona: es el que va a coincidir con lo que ve en Meta.
        name: datosPrueba?.name ?? name ?? null,
        access_token: encrypt(access_token.trim()),
        status: 'connected',
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,channel,external_id' },
    )

  if (error) {
    console.error('[meta conexiones] no se pudo guardar:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar la conexion' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, name: datosPrueba?.name ?? null })
}

export async function DELETE(request: Request) {
  let accountId: string
  try {
    const ctx = await requireRole('admin')
    accountId = ctx.accountId
  } catch (e) {
    return toErrorResponse(e)
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  // Se filtra tambien por account_id: sin eso, conocer un id ajeno bastaria
  // para desconectar la cuenta de otra organizacion.
  const { error } = await supabaseAdmin()
    .from('channel_connections')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)

  if (error) {
    return NextResponse.json({ error: 'No se pudo desconectar' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
