/**
 * Envío omnicanal para los motores de flujos y automatizaciones.
 *
 * Los dos motores fueron escritos cuando WhatsApp era el único canal: buscan
 * el teléfono del contacto y la configuración de la API de WhatsApp. Llamarlos
 * para una conversación de Messenger fallaba con "contact not found", cierto
 * en su contexto y engañoso fuera de él.
 *
 * Este módulo se interpone ANTES de esa lógica: mira el canal de la
 * conversación y, si no es WhatsApp, envía por la API de Meta y devuelve. Así
 * los motores no cambian y los flujos que ya existían siguen comportándose
 * exactamente igual.
 *
 * Los botones son el punto interesante. WhatsApp usa `interactive.button`;
 * Messenger e Instagram usan `quick_replies` sobre un texto. Son formatos
 * distintos con la misma función, y sobre todo devuelven el mismo
 * identificador al tocarlos — por eso el flujo avanza con la misma lógica en
 * los tres canales, sin ramas por plataforma.
 */

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { enviarMensaje, tipoMediaMeta } from '@/lib/meta/mensajeria'
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive'
import { decrypt } from '@/lib/whatsapp/encryption'

export interface OpcionOmnicanal {
  id: string
  titulo: string
}

export interface EnvioOmnicanal {
  accountId: string
  conversationId: string
  contactId: string
  userId: string
  texto: string
  opciones?: OpcionOmnicanal[]
  media?: { url: string; contentType: string; filename?: string | null }
  aiGenerated?: boolean
  /**
   * La forma original del menú, tal como la guarda el camino de WhatsApp.
   *
   * Sin esto la bandeja pinta el mensaje del bot como texto pelado y el agente
   * que entra a la conversación no ve qué opciones se le ofrecieron al
   * cliente — justo lo que necesita para entender por qué contestó lo que
   * contestó. Se guarda la forma de WhatsApp aunque se haya enviado como
   * opciones rápidas: es la misma información y así el historial se lee igual
   * en los tres canales.
   */
  payloadInteractivo?: InteractiveMessagePayload
}

/**
 * Envía si la conversación NO es de WhatsApp.
 *
 * Devuelve el id del mensaje cuando se encargó, o `null` cuando el canal es
 * WhatsApp — en ese caso quien llama sigue con su camino de siempre. Ese
 * `null` es deliberado: convierte este módulo en un desvío opcional en vez de
 * en un reemplazo, y hace que añadirlo a un motor sea una línea.
 */
export async function enviarSiEsCanalMeta(
  args: EnvioOmnicanal,
): Promise<{ messageId: string } | null> {
  const db = supabaseAdmin()

  const { data: conv } = await db
    .from('conversations')
    .select('channel, connection:channel_connections(external_id, access_token)')
    .eq('id', args.conversationId)
    .eq('account_id', args.accountId)
    .maybeSingle()

  const canal = (conv as { channel?: string } | null)?.channel ?? 'whatsapp'
  if (canal !== 'facebook' && canal !== 'instagram') return null

  const conexion = (
    conv as { connection?: { external_id: string; access_token: string } | null } | null
  )?.connection
  if (!conexion) {
    throw new Error(`la conversación de ${canal} no tiene una cuenta conectada`)
  }

  const { data: contacto } = await db
    .from('contacts')
    .select('facebook_id, instagram_id')
    .eq('id', args.contactId)
    .eq('account_id', args.accountId)
    .maybeSingle()

  const destinatario =
    canal === 'facebook' ? contacto?.facebook_id : contacto?.instagram_id
  if (!destinatario) {
    throw new Error(`el contacto no tiene identificador de ${canal}`)
  }

  const resultado = await enviarMensaje({
    cuentaId: conexion.external_id,
    accessToken: decrypt(conexion.access_token),
    destinatario,
    texto: args.texto,
    ...(args.opciones?.length ? { opciones: args.opciones } : {}),
    ...(args.media
      ? {
          media: {
            url: args.media.url,
            tipo: tipoMediaMeta(args.media.contentType),
          },
        }
      : {}),
  })

  // El tipo se guarda como 'interactive' cuando lleva opciones, igual que en
  // WhatsApp: así la bandeja lo pinta con el mismo formato y el historial se
  // lee igual sin importar el canal.
  await db.from('messages').insert({
    conversation_id: args.conversationId,
    sender_type: 'bot',
    sender_id: args.userId,
    content_type: args.media
      ? args.media.contentType
      : args.opciones?.length
        ? 'interactive'
        : 'text',
    content_text: args.texto,
    media_url: args.media?.url ?? null,
    interactive_payload: args.payloadInteractivo ?? null,
    message_id: resultado.messageId,
    status: 'sent',
    ai_generated: args.aiGenerated ?? false,
  })

  await db
    .from('conversations')
    .update({
      last_message_text: args.texto,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.conversationId)

  return { messageId: resultado.messageId }
}
