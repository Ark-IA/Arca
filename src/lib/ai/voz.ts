/**
 * Respuesta por voz del agente de IA.
 *
 * El agente escribe la respuesta como siempre; si la cuenta lo tiene
 * activado, ese texto se convierte en una nota de voz con la voz clonada de
 * la cuenta (servicio `servicios/tts`, Chatterbox) y se manda en lugar del
 * texto.
 *
 * Todo acá es "mejor esfuerzo": si el servicio de voz no está, tarda
 * demasiado o falla, `responderConVoz` devuelve false y quien llama manda el
 * texto. El cliente nunca se queda sin respuesta porque la voz falló.
 *
 * Solo WhatsApp por ahora: Messenger e Instagram reciben el texto.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { engineSendMedia } from '@/lib/flows/meta-send';
import { moduloActivo } from '@/lib/modulos/servidor';
import { buildMediaPath } from '@/lib/storage/upload-media';
import type { Canal } from '@/types';

export type ModoVoz = 'nunca' | 'si_audio' | 'siempre';

const BUCKET = 'chat-media';

/** En CPU, una respuesta de 3-4 frases tarda decenas de segundos. Más que esto ya no vale la pena. */
const TIEMPO_LIMITE_MS = 120_000;

function servicio(): { url: string; clave: string } | null {
  const url = process.env.ARCA_TTS_URL?.trim().replace(/\/+$/, '');
  if (!url) return null;
  return { url, clave: process.env.ARCA_TTS_CLAVE?.trim() ?? '' };
}

export function vozDisponible(): boolean {
  return servicio() !== null;
}

/** La voz de cada cuenta se guarda en el servicio con este nombre. */
export function idDeVoz(accountId: string): string {
  return `cuenta-${accountId}`;
}

/**
 * Modo de voz de la cuenta. Se lee aparte de `loadAiConfig` a propósito:
 * si la migración 083 todavía no está aplicada, la columna no existe y esta
 * consulta falla; aquella no puede fallar, porque con ella se cae el agente
 * entero.
 */
export async function modoDeVoz(
  db: SupabaseClient,
  accountId: string
): Promise<ModoVoz> {
  const { data, error } = await db
    .from('ai_configs')
    .select('voz_modo')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !data) return 'nunca';
  const modo = (data as { voz_modo?: string }).voz_modo;
  return modo === 'si_audio' || modo === 'siempre' ? modo : 'nunca';
}

/** ¿El último mensaje del cliente en esta conversación fue una nota de voz? */
export async function clienteMandoAudio(
  db: SupabaseClient,
  conversationId: string
): Promise<boolean> {
  const { data } = await db
    .from('messages')
    .select('content_type')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { content_type?: string } | null)?.content_type === 'audio';
}

async function llamar(ruta: string, init: RequestInit): Promise<Response> {
  const s = servicio();
  if (!s) throw new Error('servicio de voz no configurado (ARCA_TTS_URL)');
  const cabeceras = new Headers(init.headers);
  if (s.clave) cabeceras.set('X-Arca-Clave', s.clave);
  return fetch(`${s.url}${ruta}`, {
    ...init,
    headers: cabeceras,
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
  });
}

export async function sintetizar(
  texto: string,
  accountId: string
): Promise<Uint8Array> {
  const r = await llamar('/sintetizar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texto, voz: idDeVoz(accountId) }),
  });
  if (!r.ok)
    throw new Error(
      `servicio de voz respondió ${r.status}: ${(await r.text()).slice(0, 200)}`
    );
  return new Uint8Array(await r.arrayBuffer());
}

export async function subirMuestra(
  accountId: string,
  audio: ArrayBuffer
): Promise<{ segundos: number }> {
  const r = await llamar(`/voces/${idDeVoz(accountId)}`, {
    method: 'PUT',
    body: audio,
  });
  const cuerpo = (await r.json().catch(() => ({}))) as {
    segundos?: number;
    detail?: string;
  };
  if (!r.ok)
    throw new Error(cuerpo.detail ?? `servicio de voz respondió ${r.status}`);
  return { segundos: cuerpo.segundos ?? 0 };
}

export async function borrarMuestra(accountId: string): Promise<void> {
  await llamar(`/voces/${idDeVoz(accountId)}`, { method: 'DELETE' });
}

export async function estadoDelServicio(): Promise<{
  ok: boolean;
  modelo?: string;
  detalle?: string;
}> {
  if (!servicio())
    return {
      ok: false,
      detalle: 'No configurado en el servidor (ARCA_TTS_URL).',
    };
  try {
    const r = await llamar('/salud', { method: 'GET' });
    if (!r.ok) return { ok: false, detalle: `Responde ${r.status}.` };
    const d = (await r.json()) as { ok: boolean; modelo?: string };
    return d.ok
      ? { ok: true, modelo: d.modelo }
      : { ok: false, detalle: 'Todavía está cargando el modelo.' };
  } catch {
    return { ok: false, detalle: 'No responde.' };
  }
}

/**
 * Manda `texto` como nota de voz. Devuelve false (sin lanzar) si no se pudo:
 * quien llama manda el texto.
 */
export async function responderConVoz(args: {
  db: SupabaseClient;
  accountId: string;
  configOwnerUserId: string;
  conversationId: string;
  contactId: string;
  canal: Canal;
  texto: string;
}): Promise<boolean> {
  if (args.canal !== 'whatsapp' || !vozDisponible()) return false;
  // Módulo apagado por el superadmin: la cuenta no tiene voz contratada.
  if (!(await moduloActivo('voz'))) return false;

  try {
    const audio = await sintetizar(args.texto, args.accountId);

    const ruta = buildMediaPath(args.accountId, 'respuesta-voz.ogg');
    const almacen = args.db.storage.from(BUCKET);
    const { error: errSubida } = await almacen.upload(ruta, audio, {
      contentType: 'audio/ogg',
      cacheControl: '31536000',
      upsert: false,
    });
    if (errSubida)
      throw new Error(`no se pudo guardar el audio: ${errSubida.message}`);
    const {
      data: { publicUrl },
    } = almacen.getPublicUrl(ruta);

    await engineSendMedia({
      accountId: args.accountId,
      userId: args.configOwnerUserId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      kind: 'audio',
      link: publicUrl,
      // En la bandeja se ve lo que dijo el agente, no solo "[audio]".
      guardar: { mediaUrl: publicUrl, texto: args.texto },
    });
    return true;
  } catch (e) {
    console.error('[voz] no se pudo responder con voz, va el texto:', e);
    return false;
  }
}
