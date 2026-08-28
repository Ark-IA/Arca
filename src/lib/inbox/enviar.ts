/**
 * A dónde va un mensaje saliente, según el canal de la conversación.
 *
 * La bandeja mandaba TODO a `/api/whatsapp/send`. Con un solo canal eso era
 * correcto; desde que hay tres, responder por Messenger llegaba al camino de
 * WhatsApp, que busca teléfono o identificador de WhatsApp y fallaba con
 * "el contacto no tiene número de teléfono" — un mensaje exacto y aun así
 * inútil, porque el contacto de Facebook nunca va a tener uno.
 *
 * Este módulo es el único sitio donde se decide el destino. Existe para que la
 * decisión no se repita en los cuatro puntos de envío de la bandeja: bastaba
 * olvidarse de uno para que ese tipo de mensaje siguiera roto en Messenger,
 * que es la clase de fallo que aparece meses después.
 */

import type { Canal, Conversation } from '@/types'

/** Facebook e Instagram comparten API; WhatsApp tiene la suya. */
export function esCanalMeta(canal: Canal | undefined): boolean {
  return canal === 'facebook' || canal === 'instagram'
}

export const NOMBRE_CANAL: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Messenger',
  instagram: 'Instagram',
}

/** Lo que la bandeja quiere enviar, en el vocabulario de WhatsApp. */
export interface EnvioDeBandeja {
  message_type: string
  content_text?: string | null
  media_url?: string | null
  filename?: string | null
  template_name?: string | null
  template_language?: string | null
  template_params?: string[]
  messageParams?: unknown
  interactive_payload?: unknown
  reply_to_message_id?: string | null
}

export interface ResultadoEnvio {
  ok: boolean
  /** Motivo legible cuando `ok` es falso. */
  error?: string
}

/**
 * Manda el mensaje por el camino que corresponda.
 *
 * Devuelve el resultado en vez de lanzar: quien llama ya tiene una burbuja
 * optimista en pantalla que hay que marcar como fallida, y una excepción
 * obligaría a envolver cada sitio en su propio try/catch.
 */
export async function enviarPorCanal(
  conversation: Pick<Conversation, 'id' | 'channel'>,
  envio: EnvioDeBandeja,
): Promise<ResultadoEnvio> {
  // Las conversaciones anteriores a los canales múltiples no traen el campo
  // y son de WhatsApp. Sin este valor por defecto, toda la bandeja histórica
  // dejaría de poder responder.
  const canal = (conversation.channel ?? 'whatsapp') as Canal

  if (!esCanalMeta(canal)) {
    return llamar('/api/whatsapp/send', {
      conversation_id: conversation.id,
      ...envio,
    })
  }

  // Plantillas e interactivos son invenciones de la API de WhatsApp: no
  // existen en Messenger ni en Instagram. Se avisa con claridad en vez de
  // dejar que Meta devuelva un error de campo desconocido.
  if (envio.message_type === 'template' || envio.message_type === 'interactive') {
    return {
      ok: false,
      error: `Las plantillas y los mensajes con botones son de WhatsApp; ${NOMBRE_CANAL[canal]} no los admite. Escribe un mensaje normal.`,
    }
  }

  return llamar('/api/meta/send', {
    conversationId: conversation.id,
    text: envio.content_text ?? '',
    ...(envio.media_url
      ? { mediaUrl: envio.media_url, contentType: envio.message_type }
      : {}),
  })
}

async function llamar(url: string, cuerpo: unknown): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const datos = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: datos?.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'No se pudo contactar al servidor',
    }
  }
}
