/**
 * Respuesta por voz del agente de IA (ver src/lib/ai/voz.ts).
 *
 *   GET  /api/ai/voz            modo, si hay muestra y si el servicio responde
 *   PUT  /api/ai/voz            { modo } — nunca | si_audio | siempre
 *   POST /api/ai/voz            cuerpo = archivo de audio: la muestra a clonar
 *   POST /api/ai/voz?probar=1   { texto } -> audio/ogg con la voz de la cuenta
 *
 * Solo el dueño de la cuenta: es la voz con la que la empresa les habla a
 * sus clientes, clonada de una persona real.
 */

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  estadoDelServicio,
  sintetizar,
  subirMuestra,
  type ModoVoz,
} from '@/lib/ai/voz';

export const dynamic = 'force-dynamic';

const MODOS: ModoVoz[] = ['nunca', 'si_audio', 'siempre'];
const MAX_MUESTRA = 10 * 1024 * 1024;

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('owner');
    const [{ data }, servicio] = await Promise.all([
      supabase
        .from('ai_configs')
        .select('voz_modo, voz_muestra_subida_en')
        .eq('account_id', accountId)
        .maybeSingle(),
      estadoDelServicio(),
    ]);
    const fila = data as {
      voz_modo?: string;
      voz_muestra_subida_en?: string | null;
    } | null;
    return NextResponse.json({
      modo: fila?.voz_modo ?? 'nunca',
      muestraSubidaEn: fila?.voz_muestra_subida_en ?? null,
      hayConfiguracion: !!fila,
      servicio,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('owner');
    const { modo } = ((await request.json().catch(() => ({}))) ?? {}) as {
      modo?: string;
    };
    if (!MODOS.includes(modo as ModoVoz)) {
      return NextResponse.json({ error: 'Modo inválido' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('ai_configs')
      .update({ voz_modo: modo })
      .eq('account_id', accountId)
      .select('account_id');
    if (error) {
      return NextResponse.json(
        { error: 'No se pudo guardar' },
        { status: 500 }
      );
    }
    if (!data?.length) {
      return NextResponse.json(
        { error: 'Primero configura el agente de IA (proveedor y clave).' },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('owner');
    const probar = new URL(request.url).searchParams.get('probar') === '1';

    if (probar) {
      const { texto } = ((await request.json().catch(() => ({}))) ?? {}) as {
        texto?: string;
      };
      const frase = (texto ?? '').trim().slice(0, 300);
      if (!frase)
        return NextResponse.json(
          { error: 'Escribe una frase' },
          { status: 400 }
        );
      try {
        const audio = await sintetizar(frase, accountId);
        return new Response(Buffer.from(audio), {
          headers: { 'content-type': 'audio/ogg', 'cache-control': 'no-store' },
        });
      } catch (e) {
        console.error('[voz] prueba:', e);
        return NextResponse.json(
          {
            error:
              'El servicio de voz no respondió. Revisa que esté encendido.',
          },
          { status: 502 }
        );
      }
    }

    const audio = await request.arrayBuffer();
    if (audio.byteLength === 0) {
      return NextResponse.json(
        { error: 'El archivo está vacío' },
        { status: 400 }
      );
    }
    if (audio.byteLength > MAX_MUESTRA) {
      return NextResponse.json(
        { error: 'La muestra pasa de 10 MB' },
        { status: 413 }
      );
    }
    try {
      const { segundos } = await subirMuestra(accountId, audio);
      await supabase
        .from('ai_configs')
        .update({ voz_muestra_subida_en: new Date().toISOString() })
        .eq('account_id', accountId);
      return NextResponse.json({ ok: true, segundos });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'No se pudo subir la muestra';
      return NextResponse.json({ error: msg }, { status: 422 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
