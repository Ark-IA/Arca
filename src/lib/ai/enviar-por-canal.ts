/**
 * Cómo responde el agente de IA, según el canal de la conversación.
 *
 * `engineSendText` solo sabe hablar WhatsApp: busca el teléfono del contacto
 * y la configuración de la API de WhatsApp. Llamarlo para una conversación de
 * Messenger fallaría con "contact not found for this account" — cierto en su
 * contexto y engañoso fuera de él, porque el contacto existe y solo le falta
 * un teléfono que nunca va a tener.
 *
 * Este módulo elige el camino. Vive aparte del despachador de la bandeja
 * (`src/lib/inbox/enviar.ts`) porque aquel corre en el navegador y llama a
 * rutas HTTP; este corre en el servidor, dentro del webhook, y llama
 * directamente a las funciones de envío.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { engineSendText } from '@/lib/flows/meta-send'
import { enviarMensaje } from '@/lib/meta/mensajeria'
import { decrypt } from '@/lib/whatsapp/encryption'
import type { Canal } from '@/types'

export interface EnvioDeAgente {
  db: SupabaseClient
  accountId: string
  /** Dueño de la configuración, para las columnas de auditoría del mensaje. */
  configOwnerUserId: string
  conversationId: string
  contactId: string
  canal: Canal
  texto: string
}

export async function responderPorCanal(args: EnvioDeAgente): Promise<void> {
  const { db, accountId, configOwnerUserId, conversationId, contactId, canal, texto } = args

  if (canal === 'whatsapp') {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: texto,
      aiGenerated: true,
    })
    return
  }

  // --- Messenger e Instagram -------------------------------------------
  const { data: conv } = await db
    .from('conversations')
    .select('connection:channel_connections(external_id, access_token)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle()

  const conexion = (conv as { connection?: { external_id: string; access_token: string } | null } | null)
    ?.connection
  if (!conexion) {
    throw new Error(`la conversación de ${canal} no tiene una cuenta conectada`)
  }

  const { data: contacto } = await db
    .from('contacts')
    .select('facebook_id, instagram_id')
    .eq('id', contactId)
    .eq('account_id', accountId)
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
    texto,
  })

  // La fila se guarda DESPUÉS del envío, no antes: si Meta rechaza, no hay
  // mensaje que registrar. Es al revés que en el envío manual de la bandeja,
  // donde sí interesa dejar rastro del intento porque hay una persona
  // esperando ver qué pasó con lo que escribió.
  await db.from('messages').insert({
    conversation_id: conversationId,
    sender_type: 'bot',
    sender_id: configOwnerUserId,
    content_type: 'text',
    content_text: texto,
    message_id: resultado.messageId,
    status: 'sent',
  })

  await db
    .from('conversations')
    .update({
      last_message_text: texto,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}
