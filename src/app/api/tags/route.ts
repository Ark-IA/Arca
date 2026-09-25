/**
 * GET /api/tags — las etiquetas de la cuenta, para los selectores.
 *
 * Lo llama el editor de flujos (nodo "agregar etiqueta"). Sin esta ruta el
 * selector caía a pedir el identificador de la etiqueta escrito a mano.
 */

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const { data, error } = await supabase
      .from('tags')
      .select('id, name, color')
      .eq('account_id', accountId)
      .order('name');

    if (error) {
      console.error('[tags] no se pudieron leer:', error.message);
      return NextResponse.json(
        { error: 'No se pudieron leer las etiquetas' },
        { status: 500 }
      );
    }
    return NextResponse.json({ tags: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
