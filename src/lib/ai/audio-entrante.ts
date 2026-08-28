/**
 * Un audio entrante, convertido en texto utilizable.
 *
 * Lo llaman los dos webhooks —WhatsApp por un lado, Messenger e Instagram por
 * el otro— justo después de guardar el mensaje y ANTES de repartirlo a
 * flujos, automatizaciones y agente de IA. Vive acá y no duplicado en cada
 * webhook porque el comportamiento tiene que ser el mismo en los tres
 * canales: si en WhatsApp se transcribe y en Instagram no, el mismo escenario
 * responde distinto según por dónde entre el cliente, que es imposible de
 * explicar y peor de depurar.
 *
 * Devuelve el texto para seguir adelante. Nunca lanza y nunca devuelve algo
 * que no se pueda usar: en el peor caso devuelve el texto que ya venía.
 */

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { configDeTranscripcion, transcribirAudio } from './transcribir'

export interface AudioEntrante {
  accountId: string
  /** Fila de `messages` que ya se guardó. */
  messageId: string
  mediaUrl: string | null | undefined
  mediaType: string | null | undefined
  /** Lo que se guardó como texto. Suele estar vacío en un audio. */
  textoActual: string
  /** Cabeceras para descargar, cuando la fuente las pide (Meta las pide). */
  cabecerasDescarga?: Record<string, string>
}

/**
 * Transcribe si se puede, y deja el texto donde todo el mundo ya mira.
 *
 * La transcripción se escribe en `messages.content_text`, el mismo campo de
 * un mensaje escrito. Es la decisión que hace que no haya que tocar el motor
 * de flujos ni el de automatizaciones: para ellos, un audio transcrito ES un
 * mensaje de texto. Y de paso el asesor lee en la bandeja lo que el cliente
 * dijo sin tener que ponerse los auriculares.
 */
export async function textoDeAudioEntrante(
  args: AudioEntrante,
): Promise<string> {
  const { accountId, messageId, mediaUrl, mediaType, textoActual } = args

  if (!mediaUrl) return textoActual

  const db = supabaseAdmin()

  const { data: fila } = await db
    .from('ai_configs')
    .select('transcription_kind, transcription_api_key, transcription_model, transcription_base_url')
    .eq('account_id', accountId)
    .maybeSingle()

  // La clave se guarda cifrada, igual que la del agente. Leerla en crudo
  // mandaría el texto cifrado como credencial y el proveedor devolvería un
  // 401 que parecería «la clave está mal» cuando en realidad está bien.
  let cfg = fila as {
    transcription_kind?: string | null
    transcription_api_key?: string | null
    transcription_model?: string | null
    transcription_base_url?: string | null
  } | null

  if (cfg?.transcription_api_key) {
    try {
      cfg = { ...cfg, transcription_api_key: decrypt(cfg.transcription_api_key) }
    } catch {
      // ENCRYPTION_KEY rotada: se sigue sin transcribir en vez de tumbar el
      // mensaje entrante. El agente contestará que no puede escucharlo.
      console.error(
        `[audio] la clave de transcripción de la cuenta ${accountId} no se pudo descifrar`,
      )
      return textoActual
    }
  }

  const config = configDeTranscripcion(cfg)
  if (!config) {
    // Sin transcripción configurada no es un error: es el estado normal
    // hasta que alguien pone una clave. El mensaje sigue su camino y el
    // agente de IA, que ahora ve los audios descritos en su contexto,
    // contesta que no puede escucharlo en vez de callarse.
    return textoActual
  }

  const resultado = await transcribirAudio({
    url: mediaUrl,
    mime: mediaType,
    config,
    cabecerasDescarga: args.cabecerasDescarga,
  })
  if (!resultado) return textoActual

  const { error } = await db
    .from('messages')
    .update({ content_text: resultado.texto, transcrito: true })
    .eq('id', messageId)

  if (error) {
    // Se devuelve el texto igual: que no se haya podido guardar no es motivo
    // para desperdiciar una transcripción que ya se pagó y que sirve para
    // decidir qué contestar ahora mismo.
    console.error('[audio] no se pudo guardar la transcripción:', error.message)
  }

  // La vista previa de la bandeja también, o la lista seguiría mostrando el
  // mensaje anterior mientras el hilo ya tiene uno nuevo.
  await db
    .from('conversations')
    .update({ last_message_text: resultado.texto })
    .eq('id', (await filaDelMensaje(db, messageId)) ?? '')

  return resultado.texto
}

/** La conversación a la que pertenece un mensaje. */
async function filaDelMensaje(
  db: ReturnType<typeof supabaseAdmin>,
  messageId: string,
): Promise<string | null> {
  const { data } = await db
    .from('messages')
    .select('conversation_id')
    .eq('id', messageId)
    .maybeSingle()
  return (data as { conversation_id: string } | null)?.conversation_id ?? null
}
