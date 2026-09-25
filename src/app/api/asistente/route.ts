/**
 * POST /api/asistente — una orden al asistente del CRM.
 *
 * Acepta:
 *   - JSON  { orden, historial?, voz? }
 *   - multipart con `audio` (la nota grabada en el navegador), `historial`
 *     (JSON) y `voz` ("1" para recibir la respuesta también en audio).
 *
 * Devuelve { transcripcion?, texto, historial, pendientes, acciones, audio? }.
 * `audio` es OGG/Opus en base64 cuando se pidió voz y el servicio de voz
 * está disponible; si no, solo texto (el navegador puede leerlo en voz alta).
 *
 * Corre con la sesión de quien habla (RLS). La clave de la IA se lee con el
 * cliente de servicio porque un asesor no puede ver `ai_configs`, pero nunca
 * sale de este servidor.
 */

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { loadAiConfig } from '@/lib/ai/config';
import { configDeTranscripcion, transcribirBytes } from '@/lib/ai/transcribir';
import { sintetizar, vozDisponible } from '@/lib/ai/voz';
import { conversar, instrucciones } from '@/lib/asistente/asistente';
import type { Mensaje } from '@/lib/asistente/modelo';
import { moduloActivo } from '@/lib/modulos/servidor';
import { checkRateLimit } from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';

export const dynamic = 'force-dynamic';

const ZONA = process.env.ARCA_ZONA_HORARIA || 'America/Bogota';
const MAX_AUDIO = 8 * 1024 * 1024;

function historialDe(crudo: unknown): Mensaje[] {
  if (!Array.isArray(crudo)) return [];
  return crudo.filter(
    (m): m is Mensaje =>
      !!m &&
      typeof m === 'object' &&
      ['usuario', 'asistente', 'herramienta'].includes((m as Mensaje).rol)
  );
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId, role } = await getCurrentAccount();

    const ritmo = checkRateLimit(`asistente:${userId}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!ritmo.success) {
      return NextResponse.json(
        { error: 'Vas muy rápido. Espera un momento.' },
        { status: 429 }
      );
    }

    const admin = supabaseAdmin();
    const config = await loadAiConfig(admin, accountId);
    if (!config) {
      return NextResponse.json(
        {
          error:
            'El agente de IA no está configurado. Pídele al administrador que ponga el proveedor y la clave.',
        },
        { status: 409 }
      );
    }

    // --- Entrada: audio o texto ------------------------------------------
    let orden = '';
    let historial: Mensaje[] = [];
    let quiereVoz = false;
    let transcripcion: string | undefined;

    const tipo = request.headers.get('content-type') ?? '';
    if (tipo.includes('multipart/form-data')) {
      const form = await request.formData();
      historial = historialDe(
        JSON.parse(String(form.get('historial') ?? '[]'))
      );
      quiereVoz = form.get('voz') === '1';
      const audio = form.get('audio');
      if (audio instanceof Blob) {
        if (audio.size > MAX_AUDIO) {
          return NextResponse.json(
            { error: 'La grabación es demasiado larga.' },
            { status: 413 }
          );
        }
        const cfgT = await configTranscripcion(admin, accountId);
        if (!cfgT) {
          return NextResponse.json(
            {
              error:
                'La transcripción de voz no está configurada (Configuración → Agente de IA).',
            },
            { status: 409 }
          );
        }
        const t = await transcribirBytes({
          datos: await audio.arrayBuffer(),
          mime: audio.type,
          config: cfgT,
        });
        if (!t)
          return NextResponse.json(
            { error: 'No te entendí. ¿Lo repites?' },
            { status: 422 }
          );
        orden = t.texto;
        transcripcion = t.texto;
      } else {
        orden = String(form.get('orden') ?? '');
      }
    } else {
      const cuerpo = (await request.json().catch(() => ({}))) as {
        orden?: string;
        historial?: unknown;
        voz?: boolean;
      };
      orden = cuerpo.orden ?? '';
      historial = historialDe(cuerpo.historial);
      quiereVoz = !!cuerpo.voz;
    }

    orden = orden.trim().slice(0, 1000);
    if (!orden)
      return NextResponse.json(
        { error: 'Dime qué necesitas.' },
        { status: 400 }
      );

    // --- Conversar -------------------------------------------------------
    const { data: perfil } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const r = await conversar({
      ctx: { db: supabase, accountId, userId },
      config,
      sistema: instrucciones({
        nombre:
          (perfil as { full_name?: string } | null)?.full_name ?? 'la persona',
        rol: role,
        zona: ZONA,
      }),
      historial,
      orden,
      soloLectura: !hasMinRole(role, 'agent'),
    });

    // --- Voz de respuesta (opcional) --------------------------------------
    let audio: string | undefined;
    if (quiereVoz && vozDisponible() && (await moduloActivo('voz'))) {
      try {
        audio = Buffer.from(await sintetizar(r.texto, accountId)).toString(
          'base64'
        );
      } catch (e) {
        console.error('[asistente] voz:', e);
      }
    }

    return NextResponse.json({ transcripcion, ...r, audio });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('el proveedor de IA')) {
      console.error('[asistente]', err.message);
      return NextResponse.json(
        { error: 'La IA no respondió. Intenta de nuevo.' },
        { status: 502 }
      );
    }
    return toErrorResponse(err);
  }
}

async function configTranscripcion(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string
) {
  const { data } = await db
    .from('ai_configs')
    .select(
      'transcription_kind, transcription_api_key, transcription_model, transcription_base_url'
    )
    .eq('account_id', accountId)
    .maybeSingle();
  if (!data) return null;
  const fila = { ...(data as Record<string, string | null>) };
  if (fila.transcription_api_key) {
    try {
      fila.transcription_api_key = decrypt(fila.transcription_api_key);
    } catch {
      return null;
    }
  }
  return configDeTranscripcion(fila);
}
