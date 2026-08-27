/**
 * Colas de asesores.
 *
 *   GET  /api/colas   — listar, con sus miembros. Cualquier miembro puede
 *                       leerlas: un asesor necesita ver el nombre de la cola
 *                       en la conversación que está atendiendo.
 *   POST /api/colas    — crear. Solo administración.
 *
 * El detalle (editar, borrar, repartir gente) vive en `[id]/route.ts`.
 */

import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export const COLORES_DE_COLA = [
  'slate',
  'blue',
  'emerald',
  'amber',
  'violet',
  'rose',
  'cyan',
] as const

export interface ColaConMiembros {
  id: string
  name: string
  description: string | null
  color: string
  is_active: boolean
  miembros: { user_id: string; full_name: string | null }[]
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()

    const { data, error } = await supabase
      .from('colas')
      .select('id, name, description, color, is_active, cola_miembros(user_id)')
      .eq('account_id', accountId)
      .order('name')

    if (error) {
      console.error('[colas] no se pudieron leer:', error.message)
      return NextResponse.json({ error: 'No se pudieron leer las colas' }, { status: 500 })
    }

    const filas = (data ?? []) as {
      id: string
      name: string
      description: string | null
      color: string
      is_active: boolean
      cola_miembros: { user_id: string }[] | null
    }[]

    // Los nombres se resuelven en una sola consulta y no una por cola: con
    // seis colas y cuatro asesores serían siete viajes para pintar una lista.
    const ids = [
      ...new Set(filas.flatMap((f) => (f.cola_miembros ?? []).map((m) => m.user_id))),
    ]
    const nombres = new Map<string, string | null>()
    if (ids.length > 0) {
      const { data: perfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', ids)
      for (const p of (perfiles ?? []) as { user_id: string; full_name: string | null }[]) {
        nombres.set(p.user_id, p.full_name)
      }
    }

    const colas: ColaConMiembros[] = filas.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      color: f.color,
      is_active: f.is_active,
      miembros: (f.cola_miembros ?? []).map((m) => ({
        user_id: m.user_id,
        full_name: nombres.get(m.user_id) ?? null,
      })),
    }))

    return NextResponse.json({ colas })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const cuerpo = (await request.json().catch(() => null)) as {
      name?: unknown
      description?: unknown
      color?: unknown
    } | null

    const nombre = typeof cuerpo?.name === 'string' ? cuerpo.name.trim() : ''
    if (!nombre) {
      return NextResponse.json(
        { error: 'La cola necesita un nombre.' },
        { status: 400 },
      )
    }

    const color =
      typeof cuerpo?.color === 'string' &&
      (COLORES_DE_COLA as readonly string[]).includes(cuerpo.color)
        ? cuerpo.color
        : 'slate'

    const { data, error } = await supabase
      .from('colas')
      .insert({
        account_id: accountId,
        name: nombre,
        description:
          typeof cuerpo?.description === 'string' && cuerpo.description.trim()
            ? cuerpo.description.trim()
            : null,
        color,
      })
      .select('id, name, description, color, is_active')
      .single()

    if (error) {
      // 23505 = el índice único por nombre. Es un error del usuario, no del
      // sistema, y merece una frase que se entienda en vez de un 500.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Ya existe una cola llamada «${nombre}».` },
          { status: 409 },
        )
      }
      console.error('[colas] no se pudo crear:', error.message)
      return NextResponse.json({ error: 'No se pudo crear la cola' }, { status: 500 })
    }

    return NextResponse.json({ cola: { ...data, miembros: [] } }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
