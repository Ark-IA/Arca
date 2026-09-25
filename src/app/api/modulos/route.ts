/**
 * GET /api/modulos — qué módulos están apagados en esta instalación y si
 * quien pregunta es superadministrador. Lo usa el panel para dibujar el menú.
 *
 * Solo informa. Las barreras de verdad están en el middleware y en los
 * motores (ver src/lib/modulos/catalogo.ts).
 */

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { modulosApagados } from '@/lib/modulos/servidor';
import { esSuperadmin } from '@/lib/modulos/superadmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apagados = await modulosApagados();
  return NextResponse.json({
    apagados: [...apagados],
    superadmin: !!user.email_confirmed_at && esSuperadmin(user.email),
  });
}
