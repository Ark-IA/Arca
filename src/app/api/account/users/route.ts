/**
 * POST /api/account/users
 *
 * Crear un usuario directamente, sin invitación.
 *
 * Ya existía el camino de invitar: se manda un enlace y la persona elige su
 * contraseña. Sigue siendo el mejor camino cuando hay un correo real detrás.
 * Pero no sirve para el caso que pidió el cliente: un supervisor que da de
 * alta a los asesores del turno y les entrega el usuario ya hecho. Esperar a
 * que cada uno abra un correo no es una opción cuando la persona está
 * sentada al lado.
 *
 * El correo ES el usuario: la pantalla de inicio de sesión pide correo, así
 * que inventar un nombre de usuario aparte crearía una credencial con la que
 * después no se podría entrar.
 *
 * Sobre la contraseña: se recibe, se pasa a Supabase y se olvida. No se
 * registra en ningún log, no se guarda en ninguna tabla nuestra y no vuelve
 * en la respuesta. Quien la creó ya la sabe; nadie más tiene por qué.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { esExtensionValida } from '@/lib/telefonia/sip'

export const dynamic = 'force-dynamic'

/** Los roles que se pueden repartir. `owner` no: hay uno y no se regala. */
const ROLES = ['admin', 'agent', 'viewer'] as const
type RolAsignable = (typeof ROLES)[number]

const LARGO_MINIMO = 10

function clienteDeServicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limite = checkRateLimit(`crear-usuario:${userId}`, RATE_LIMITS.adminAction)
    if (!limite.success) return rateLimitResponse(limite)

    const cuerpo = (await request.json().catch(() => null)) as {
      email?: unknown
      password?: unknown
      full_name?: unknown
      role?: unknown
      sip_extension?: unknown
      colas?: unknown
    } | null
    if (!cuerpo) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    // ---- validación ----

    const email =
      typeof cuerpo.email === 'string' ? cuerpo.email.trim().toLowerCase() : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Escribe un correo válido: es con lo que va a iniciar sesión.' },
        { status: 400 },
      )
    }

    const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''
    if (password.length < LARGO_MINIMO) {
      return NextResponse.json(
        {
          error: `La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`,
        },
        { status: 400 },
      )
    }

    const role: RolAsignable = (ROLES as readonly string[]).includes(
      cuerpo.role as string,
    )
      ? (cuerpo.role as RolAsignable)
      : 'agent'

    const fullName =
      typeof cuerpo.full_name === 'string' && cuerpo.full_name.trim()
        ? cuerpo.full_name.trim()
        : email.split('@')[0]

    let sipExtension: string | null = null
    if (typeof cuerpo.sip_extension === 'string' && cuerpo.sip_extension.trim()) {
      const ext = cuerpo.sip_extension.trim()
      if (!esExtensionValida(ext)) {
        return NextResponse.json(
          { error: 'La extensión tiene que ser un número de 3 a 6 dígitos.' },
          { status: 400 },
        )
      }
      // La misma extensión en dos personas hace que la segunda entre sin
      // teléfono y sin ninguna pista de por qué.
      const { data: enUso } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('account_id', accountId)
        .eq('sip_extension', ext)
        .maybeSingle()
      if (enUso) {
        return NextResponse.json(
          { error: `La extensión ${ext} ya está asignada a alguien del equipo.` },
          { status: 409 },
        )
      }
      sipExtension = ext
    }

    const colas = Array.isArray(cuerpo.colas)
      ? [
          ...new Set(
            (cuerpo.colas as unknown[]).filter(
              (c): c is string => typeof c === 'string' && c.length > 0,
            ),
          ),
        ]
      : []

    // ---- alta ----

    const admin = clienteDeServicio()

    const { data: creado, error: errAlta } = await admin.auth.admin.createUser({
      email,
      password,
      // Sin confirmación por correo: el punto de esta ruta es que la persona
      // pueda entrar ya. Pedirle que confirme un correo sería volver al
      // camino de la invitación por la puerta de atrás.
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (errAlta || !creado?.user) {
      const msg = errAlta?.message ?? ''
      if (/already/i.test(msg) || /registered/i.test(msg)) {
        return NextResponse.json(
          { error: `Ya existe un usuario con el correo ${email}.` },
          { status: 409 },
        )
      }
      // El mensaje crudo de Supabase puede describir la política de
      // contraseñas del proyecto; se pasa porque es útil y no revela nada.
      console.error('[usuarios] no se pudo crear:', msg)
      return NextResponse.json(
        { error: msg || 'No se pudo crear el usuario' },
        { status: 500 },
      )
    }

    const nuevoId = creado.user.id

    // El disparador `handle_new_user` le crea a cada usuario nuevo SU PROPIA
    // cuenta y lo deja como dueño de ella. Correcto cuando alguien se
    // registra solo; acá hay que moverlo a la cuenta de quien lo creó, y
    // barrer la cuenta personal que quedó vacía.
    const { data: perfil } = await admin
      .from('profiles')
      .select('account_id')
      .eq('user_id', nuevoId)
      .maybeSingle()
    const cuentaHuerfana = (perfil as { account_id: string | null } | null)?.account_id

    const filaPerfil = {
      user_id: nuevoId,
      full_name: fullName,
      email,
      account_id: accountId,
      account_role: role,
      sip_extension: sipExtension,
    }

    // La credencial SIP no se crea acá a propósito: la crea un disparador de
    // la base (migración 060) en cuanto `sip_extension` deja de ser nula.
    // Antes cada camino que asignaba una extensión tenía que acordarse, y el
    // que se olvidaba dejaba a la persona con extensión y sin teléfono, sin
    // ningún error que lo explicara.

    // `upsert` y no `update`: el disparador traga sus propios errores, así
    // que el perfil puede no existir. Sin esto, ese caso dejaría un usuario
    // capaz de iniciar sesión y sin ninguna cuenta — dentro, y en ninguna
    // parte.
    const { error: errPerfil } = await admin
      .from('profiles')
      .upsert(filaPerfil, { onConflict: 'user_id' })

    if (errPerfil) {
      // Deshacer. Un usuario de autenticación sin perfil entra al producto y
      // se estrella contra una pantalla vacía, y solo se puede limpiar desde
      // la base de datos.
      await admin.auth.admin.deleteUser(nuevoId)
      console.error('[usuarios] perfil fallido, alta revertida:', errPerfil.message)
      return NextResponse.json(
        { error: 'No se pudo completar el alta' },
        { status: 500 },
      )
    }

    if (cuentaHuerfana && cuentaHuerfana !== accountId) {
      // Solo si quedó sin nadie. La comprobación no sobra: si algo saliera
      // raro y esa cuenta tuviera miembros, borrarla se llevaría sus datos
      // por delante.
      const { count } = await admin
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_id', cuentaHuerfana)
      if ((count ?? 0) === 0) {
        await admin.from('accounts').delete().eq('id', cuentaHuerfana)
      }
    }

    if (colas.length > 0) {
      // Solo colas de esta cuenta: un identificador cualquiera metería al
      // usuario en la cola de otra organización.
      const { data: propias } = await admin
        .from('colas')
        .select('id')
        .eq('account_id', accountId)
        .in('id', colas)
      const validas = ((propias ?? []) as { id: string }[]).map((c) => c.id)
      if (validas.length > 0) {
        await admin
          .from('cola_miembros')
          .insert(validas.map((cola_id) => ({ cola_id, user_id: nuevoId })))
      }
    }

    // La contraseña no vuelve. Quien la escribió ya la tiene.
    return NextResponse.json(
      {
        user: {
          user_id: nuevoId,
          email,
          full_name: fullName,
          role,
          sip_extension: sipExtension,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    return toErrorResponse(err)
  }
}
