/**
 * GET /api/telefonia/credenciales
 *
 * Lo que el telefono del navegador necesita para registrarse contra Asterisk.
 *
 * Devuelve SIEMPRE las credenciales de quien llama y de nadie mas. No hay
 * parametro de usuario a proposito: si lo hubiera, tarde o temprano alguien
 * probaria con el identificador del companero de al lado.
 */

import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { nombreEndpoint, urlWebSocket } from '@/lib/telefonia/sip'
import { servidoresIce } from '@/lib/telefonia/turn'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()

    const db = supabaseAdmin()

    const { data: perfil } = await db
      .from('profiles')
      .select('sip_extension, full_name, email')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    // Sin extension no hay telefono. No es un error: la mayoria de los
    // usuarios de un CRM nunca van a tener una.
    if (!perfil?.sip_extension) {
      return NextResponse.json({ habilitado: false })
    }

    const { data: cred } = await db
      .from('sip_credentials')
      .select('password')
      .eq('user_id', ctx.userId)
      .maybeSingle()

    // Extension sin clave significa que la 045 no llego a generarla o que
    // alguien toco la base a mano. Se avisa en vez de devolver un telefono
    // que va a fallar al registrarse sin explicacion.
    if (!cred?.password) {
      console.warn('[telefonia] extension sin clave para', ctx.userId)
      return NextResponse.json({
        habilitado: false,
        motivo: 'Tenés una extensión asignada pero le falta la clave. Pedile a un administrador que te la vuelva a asignar.',
      })
    }

    // El origen real, no el que ve el contenedor.
    //
    // Detras de nginx, `request.url` trae el protocolo de la conexion interna
    // (http) y no el que usa la persona (https). Se prefiere la direccion
    // configurada, y si no la hay se reconstruye con las cabeceras que pone
    // el proxy.
    const origen =
      process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') ||
      (() => {
        const url = new URL(request.url)
        const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || url.host
        const proto =
          request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
          url.protocol.replace(':', '')
        return `${proto}://${host}`
      })()
    const anfitrion = new URL(origen).hostname

    return NextResponse.json({
      habilitado: true,
      credenciales: {
        extension: perfil.sip_extension,
        password: cred.password,
        endpoint: nombreEndpoint(ctx.accountId, perfil.sip_extension),
        dominio: anfitrion,
        websocket: urlWebSocket(origen),
        nombre: perfil.full_name || perfil.email || perfil.sip_extension,
        // El TURN vive en el mismo servidor. Se firma una credencial nueva en
        // cada carga: son de un solo uso practico y caducan solas.
        iceServers: servidoresIce(
          process.env.TURN_HOST || anfitrion,
          process.env.TURN_SECRET,
          ctx.userId,
        ),
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
