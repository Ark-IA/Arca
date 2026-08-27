/**
 * Una cola concreta.
 *
 *   PATCH  /api/colas/[id]  — renombrar, describir, color, activar, y
 *                             reemplazar la lista de asesores.
 *   DELETE /api/colas/[id]  — borrar.
 *
 * Las dos son de administración. Repartir quién atiende qué es una decisión
 * de organización, no algo que un asesor deba poder cambiarse a sí mismo.
 */

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { COLORES_DE_COLA } from '../route'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const { supabase, accountId } = await requireRole('admin')

    // La cola tiene que ser de esta cuenta. Esta ruta usa el cliente del
    // usuario, así que RLS ya lo impediría — pero un 404 explícito es mejor
    // que un UPDATE que afecta cero filas y devuelve éxito.
    const { data: existe } = await supabase
      .from('colas')
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!existe) {
      return NextResponse.json({ error: 'La cola no existe' }, { status: 404 })
    }

    const cuerpo = (await request.json().catch(() => null)) as {
      name?: unknown
      description?: unknown
      color?: unknown
      is_active?: unknown
      miembros?: unknown
    } | null
    if (!cuerpo) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const parche: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (cuerpo.name !== undefined) {
      const nombre = typeof cuerpo.name === 'string' ? cuerpo.name.trim() : ''
      if (!nombre) {
        return NextResponse.json(
          { error: 'La cola necesita un nombre.' },
          { status: 400 },
        )
      }
      parche.name = nombre
    }
    if (cuerpo.description !== undefined) {
      parche.description =
        typeof cuerpo.description === 'string' && cuerpo.description.trim()
          ? cuerpo.description.trim()
          : null
    }
    if (
      typeof cuerpo.color === 'string' &&
      (COLORES_DE_COLA as readonly string[]).includes(cuerpo.color)
    ) {
      parche.color = cuerpo.color
    }
    if (typeof cuerpo.is_active === 'boolean') parche.is_active = cuerpo.is_active

    const { error: errUpd } = await supabase
      .from('colas')
      .update(parche)
      .eq('id', id)
      .eq('account_id', accountId)

    if (errUpd) {
      if (errUpd.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe otra cola con ese nombre.' },
          { status: 409 },
        )
      }
      console.error('[colas] no se pudo actualizar:', errUpd.message)
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
    }

    // La lista de asesores se reemplaza entera, no se parchea.
    //
    // Un alta y una baja por separado dejan una ventana en la que la cola
    // tiene la gente de antes y la de ahora a la vez, y en ese momento una
    // conversación puede caerle a alguien que ya no la atiende. Reemplazar
    // es una sola intención: «estos son los que atienden».
    if (Array.isArray(cuerpo.miembros)) {
      const ids = [
        ...new Set(
          (cuerpo.miembros as unknown[]).filter(
            (m): m is string => typeof m === 'string' && m.length > 0,
          ),
        ),
      ]

      // Solo gente de esta cuenta. Sin esta comprobación, un identificador
      // cualquiera entraría en la tabla y la cola tendría un miembro
      // fantasma que nadie puede quitar desde la interfaz.
      const { data: dela } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('account_id', accountId)
        .in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const validos = new Set(
        ((dela ?? []) as { user_id: string }[]).map((p) => p.user_id),
      )

      await supabase.from('cola_miembros').delete().eq('cola_id', id)
      const aInsertar = ids.filter((u) => validos.has(u))
      if (aInsertar.length > 0) {
        const { error: errIns } = await supabase
          .from('cola_miembros')
          .insert(aInsertar.map((user_id) => ({ cola_id: id, user_id })))
        if (errIns) {
          console.error('[colas] no se pudieron guardar los miembros:', errIns.message)
          return NextResponse.json(
            { error: 'La cola se guardó, pero no sus asesores' },
            { status: 500 },
          )
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const { supabase, accountId } = await requireRole('admin')

    // Las conversaciones que esperaban aquí quedan sin cola, no borradas:
    // la columna es `on delete set null`. Se avisa cuántas son, porque
    // borrar una cola con gente esperando es justo lo que nadie quiere
    // hacer sin enterarse.
    const { count } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('cola_id', id)

    const { error } = await supabase
      .from('colas')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) {
      console.error('[colas] no se pudo borrar:', error.message)
      return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, conversacionesLiberadas: count ?? 0 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
