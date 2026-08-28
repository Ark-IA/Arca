import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_type: string | null
  content_text: string | null
}

/**
 * Cómo se le nombra al modelo un mensaje que no trae texto.
 *
 * Entre corchetes y en tercera persona a propósito: tiene que quedar claro
 * que es una descripción del sistema y no algo que el cliente escribió, o el
 * modelo acabaría contestando a la palabra «Audio».
 */
const SIN_TEXTO: Record<string, string> = {
  audio: '[el cliente envió una nota de voz]',
  image: '[el cliente envió una imagen]',
  video: '[el cliente envió un video]',
  document: '[el cliente envió un archivo]',
  location: '[el cliente compartió su ubicación]',
}

/**
 * ¿Es un envío al que el agente puede contestar algo útil aunque no traiga
 * texto?
 *
 * Lo usan los dos webhooks para decidir si vale la pena despertar al agente.
 * Vive junto a la tabla de descripciones y no copiado en cada webhook porque
 * las dos respuestas tienen que ser la misma: si un webhook llamara al agente
 * por un tipo que el contexto no sabe describir, el agente recibiría una
 * conversación vacía y no diría nada — silencio otra vez, y esta vez con una
 * llamada al proveedor pagada de por medio.
 */
export function esMediaDescribible(contentType: string | null | undefined): boolean {
  return Boolean(contentType && contentType in SIN_TEXTO)
}

/**
 * ¿El último mensaje del cliente es una de estas descripciones?
 *
 * Sirve para no molestar al modelo con una decisión que ya está tomada. Si
 * mandó una nota de voz que no se pudo transcribir, la respuesta correcta es
 * una sola —decirle que no se puede escuchar y pedirle que la escriba— y no
 * hay nada que un modelo pueda aportar ahí.
 *
 * Preguntárselo salía caro en las tres monedas: dinero (una llamada al
 * proveedor), tiempo (segundos de espera) y fiabilidad. Y de hecho decidía
 * mal: con la base de conocimiento activa, el último bloque del prompt le
 * dice «si no cubren la pregunta, no adivines: escalá», y una descripción de
 * audio no está cubierta por ninguna documentación. El modelo escalaba a un
 * humano porque alguien mandó un audio.
 */
export function esDescripcionDeMedios(texto: string | null | undefined): boolean {
  if (!texto) return false
  return Object.values(SIN_TEXTO).includes(texto.trim())
}

/**
 * Fetch the last N messages of a conversation and map them to the
 * provider-neutral chat shape. Customer messages become `user`; agent
 * and bot messages become `assistant`.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 *
 * Antes esta consulta filtraba `content_type = 'text'`, con el argumento de
 * que los mensajes de medios «no llevan texto que modelar». Suena razonable
 * y tenía una consecuencia fea: un cliente que mandaba una nota de voz
 * desaparecía del contexto, así que el agente no veía ningún mensaje nuevo y
 * se quedaba callado. Desde afuera, el bot dejaba de responder al recibir un
 * audio y no había ningún error que lo explicara.
 *
 * Ahora entran todos. Los que traen texto aportan su texto — incluida la
 * transcripción de un audio, que se guarda en el mismo campo. Los que no,
 * entran descritos, para que el modelo sepa que llegó algo y pueda al menos
 * decir que no puede escucharlo. Contestar «no puedo oír el audio, ¿me lo
 * escribís?» es infinitamente mejor que el silencio.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_type, content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()

  return rows
    .map((m) => {
      const texto = m.content_text?.trim()
      if (texto) return { fila: m, contenido: texto }

      // Sin texto: solo se describe lo que manda el CLIENTE. Un envío nuestro
      // sin texto (una plantilla, un adjunto suelto) no aporta nada al
      // modelo, y describirlo sería llenarle el contexto de ruido propio.
      if (m.sender_type !== 'customer') return null
      const descripcion = SIN_TEXTO[m.content_type ?? '']
      return descripcion ? { fila: m, contenido: descripcion } : null
    })
    .filter((x): x is { fila: DbMessage; contenido: string } => x !== null)
    .map(({ fila, contenido }) => ({
      role: fila.sender_type === 'customer' ? 'user' : 'assistant',
      content: contenido,
    }))
}
