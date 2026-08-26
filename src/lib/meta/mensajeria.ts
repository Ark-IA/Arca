/**
 * Messenger e Instagram: envio y recepcion.
 *
 * Los dos usan la MISMA API (Graph) y el mismo formato de webhook, pero con
 * rutas distintas y un identificador de usuario distinto por canal:
 *
 *   facebook   -> PSID  (Page-Scoped ID)   POST /{page-id}/messages
 *   instagram  -> IGSID (Instagram-Scoped) POST /{ig-user-id}/messages
 *
 * Se los trata como canales SEPARADOS, no como uno solo con una bandera:
 * cada uno tiene su cuenta conectada, sus conversaciones y sus metricas.
 */

const VERSION = 'v23.0'
const BASE = `https://graph.facebook.com/${VERSION}`

export type CanalMeta = 'facebook' | 'instagram'

/** Los tipos de adjunto que acepta la API de mensajeria de Meta. */
export type TipoMediaMeta = 'image' | 'video' | 'audio' | 'file'

/**
 * Traduce el tipo interno del CRM al de Meta.
 *
 * El CRM usa los nombres de WhatsApp ('document'); Meta lo llama 'file'.
 * Cualquier otro se manda como archivo generico antes que fallar.
 */
export function tipoMediaMeta(contentType: string): TipoMediaMeta {
  if (contentType === 'image') return 'image'
  if (contentType === 'video') return 'video'
  if (contentType === 'audio') return 'audio'
  return 'file'
}

export interface EnvioMeta {
  /** Page ID (facebook) o IG Professional Account ID (instagram). */
  cuentaId: string
  accessToken: string
  /** PSID o IGSID de la persona. */
  destinatario: string
  texto: string
  /**
   * Adjunto, cuando lo hay. Meta lo descarga de la URL, asi que tiene que ser
   * publica: por eso se sube primero al almacenamiento del CRM.
   */
  media?: { url: string; tipo: TipoMediaMeta }
}

export interface ResultadoEnvio {
  messageId: string
  recipientId?: string
}

/**
 * Envia un mensaje de texto.
 *
 * `messaging_type: 'RESPONSE'` no es decorativo: le dice a Meta que esto
 * responde a un mensaje del usuario, que es lo unico permitido fuera de la
 * ventana de 24 horas sin una etiqueta aprobada. Omitirlo hace que Meta
 * rechace toda respuesta que llegue tarde, con un error que no menciona
 * este campo.
 */
export async function enviarMensaje(args: EnvioMeta): Promise<ResultadoEnvio> {
  const { cuentaId, accessToken, destinatario, texto, media } = args

  /*
   * Texto y adjunto son cuerpos distintos, no dos campos del mismo.
   *
   * Meta no acepta `{ text, attachment }` a la vez: si van los dos, ignora uno
   * sin avisar. Por eso se elige uno y, cuando hay archivo con pie de foto, el
   * pie se manda como un segundo mensaje (ver mas abajo en la ruta de envio).
   */
  const mensaje = media
    ? {
        attachment: {
          type: media.tipo,
          payload: { url: media.url, is_reusable: true },
        },
      }
    : { text: texto }

  const respuesta = await fetch(`${BASE}/${cuentaId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: destinatario },
      message: mensaje,
      messaging_type: 'RESPONSE',
    }),
  })

  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    const msg = datos?.error?.message ?? `Meta respondio ${respuesta.status}`
    const codigo = datos?.error?.code
    throw new Error(codigo ? `${msg} (codigo ${codigo})` : msg)
  }
  return { messageId: datos.message_id, recipientId: datos.recipient_id }
}

/**
 * Pide a Meta el nombre y la foto de quien escribe.
 *
 * Sin esto la bandeja mostraria identificadores de 16 digitos en vez de
 * personas. Falla en silencio a proposito: que no se pueda leer el perfil
 * -- permisos, cuenta restringida -- no puede impedir que el mensaje entre.
 */
export async function perfilDeUsuario(
  canal: CanalMeta,
  usuarioId: string,
  accessToken: string,
): Promise<{ nombre?: string; foto?: string }> {
  // Instagram usa otros nombres de campo que Messenger.
  const campos = canal === 'instagram' ? 'name,username,profile_pic' : 'name,profile_pic'
  try {
    const r = await fetch(`${BASE}/${usuarioId}?fields=${campos}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!r.ok) return {}
    const d = await r.json()
    return {
      nombre: d.name || d.username || undefined,
      foto: d.profile_pic || undefined,
    }
  } catch {
    return {}
  }
}

// ============================================================
// Forma del webhook
// ============================================================
//
// Messenger e Instagram comparten estructura. El campo `object` del nivel
// superior dice cual es: "page" para Messenger, "instagram" para Instagram.

export interface MensajeEntranteMeta {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: {
    mid: string
    text?: string
    /** Presente cuando el mensaje lo enviamos nosotros y vuelve como eco. */
    is_echo?: boolean
    attachments?: Array<{
      type: string
      payload?: { url?: string }
    }>
  }
  /** Avisos de leido y entregado, que no son mensajes. */
  delivery?: unknown
  read?: unknown
}

export interface EntradaWebhookMeta {
  object: 'page' | 'instagram'
  entry: Array<{
    id: string
    time: number
    messaging?: MensajeEntranteMeta[]
  }>
}

/** Traduce el `object` del webhook al nombre de canal que usa la base. */
export function canalDesdeObjeto(objeto: string): CanalMeta | null {
  if (objeto === 'page') return 'facebook'
  if (objeto === 'instagram') return 'instagram'
  return null
}
