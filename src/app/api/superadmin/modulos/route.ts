/**
 * Módulos de la instalación, para el superadministrador.
 *
 *   GET /api/superadmin/modulos  — todos, con su estado.
 *   PUT /api/superadmin/modulos  — { clave, activo } para prender o apagar uno.
 *
 * Solo los correos de ARCA_SUPERADMINS, y con el correo verificado: si no,
 * bastaría registrarse con ese correo en una instalación donde todavía no
 * existe para quedar como superadmin.
 */

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { createClient } from '@/lib/supabase/server';
import { INFO_MODULOS, MODULOS, esModulo } from '@/lib/modulos/catalogo';
import { olvidarModulos } from '@/lib/modulos/servidor';
import { esSuperadmin } from '@/lib/modulos/superadmin';

export const dynamic = 'force-dynamic';

async function superadmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !user.email_confirmed_at || !esSuperadmin(user.email))
    return null;
  return user.email;
}

const PROHIBIDO = () =>
  NextResponse.json({ error: 'Forbidden' }, { status: 403 });

export async function GET() {
  if (!(await superadmin())) return PROHIBIDO();

  const { data, error } = await supabaseAdmin()
    .from('modulos_instalacion')
    .select('clave, activo, actualizado_en, actualizado_por');
  if (error) {
    return NextResponse.json(
      { error: 'No se pudieron leer los módulos' },
      { status: 500 }
    );
  }

  const filas = new Map((data ?? []).map((f) => [f.clave as string, f]));
  return NextResponse.json({
    modulos: MODULOS.map((clave) => {
      const fila = filas.get(clave);
      return {
        clave,
        ...INFO_MODULOS[clave],
        activo: fila ? fila.activo : true,
        actualizado_en: fila?.actualizado_en ?? null,
        actualizado_por: fila?.actualizado_por ?? null,
      };
    }),
  });
}

export async function PUT(request: Request) {
  const correo = await superadmin();
  if (!correo) return PROHIBIDO();

  const cuerpo = (await request.json().catch(() => null)) as {
    clave?: unknown;
    activo?: unknown;
  } | null;
  if (
    !cuerpo ||
    !esModulo(cuerpo.clave) ||
    typeof cuerpo.activo !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'Se espera { clave, activo }' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin().from('modulos_instalacion').upsert({
    clave: cuerpo.clave,
    activo: cuerpo.activo,
    actualizado_en: new Date().toISOString(),
    actualizado_por: correo,
  });
  if (error) {
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  olvidarModulos();
  return NextResponse.json({ ok: true });
}
