/**
 * POST /api/asistente/confirmar — { nombre, args }
 *
 * Ejecuta una acción que el asistente dejó pendiente de confirmación (mover o
 * cerrar un negocio…). Solo acepta herramientas marcadas `confirmar`: las
 * demás ya se ejecutaron en la conversación, y por aquí no se puede colar
 * ninguna otra. Corre con la sesión de quien confirma (RLS).
 */

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { fraseDeConfirmacion } from '@/lib/asistente/asistente';
import { ejecutarHerramienta, herramienta } from '@/lib/asistente/herramientas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId, role } = await getCurrentAccount();
    if (!hasMinRole(role, 'agent')) {
      return NextResponse.json(
        { error: 'Tu rol solo permite consultar.' },
        { status: 403 }
      );
    }

    const { nombre, args } = ((await request.json().catch(() => ({}))) ??
      {}) as {
      nombre?: string;
      args?: Record<string, unknown>;
    };
    const h = nombre ? herramienta(nombre) : undefined;
    if (!h || !h.confirmar) {
      return NextResponse.json(
        { error: 'Esa acción no se confirma por aquí.' },
        { status: 400 }
      );
    }

    const r = await ejecutarHerramienta(
      { db: supabase, accountId, userId },
      h.nombre,
      args ?? {}
    );
    if (!r.ok)
      return NextResponse.json({ ok: false, texto: r.error }, { status: 422 });
    return NextResponse.json({
      ok: true,
      texto: fraseDeConfirmacion(h.nombre, r.resultado),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
