import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lo que una conexión concreta le impone al agente.
 *
 * Una cuenta puede tener dos líneas de WhatsApp, tres páginas de Facebook y
 * una de Instagram. El proveedor, el modelo y la clave son de la CUENTA
 * —misma factura, y tener cuatro claves iguales solo sirve para que una
 * quede desactualizada—, pero la PERSONALIDAD es de cada conexión: la línea
 * de ventas y la de soporte no pueden contestar igual.
 *
 * Todo aquí es opcional. Nulo significa «esta conexión no dice nada especial,
 * usá lo de la cuenta», que es como se comportaba el sistema antes de que
 * existieran las conexiones múltiples.
 */
export interface AjustesDeConexion {
  id: string
  nombre: string | null
  /** Null = usar el prompt de la cuenta. */
  systemPrompt: string | null
  /**
   * Interruptor de ESTA conexión. Se suma al de la cuenta: los dos tienen
   * que estar encendidos para que el agente conteste aquí.
   */
  aiEnabled: boolean
  /** Cola a la que cae lo que entre por aquí. Null = no encolar. */
  colaId: string | null
}

/**
 * Los ajustes de la conexión por la que entró una conversación.
 *
 * Devuelve `null` cuando la conversación no tiene conexión asociada — una
 * fila anterior a la migración 070, o creada por un camino que todavía no
 * la rellena. Quien llama tiene que seguir con los valores de la cuenta:
 * quedarse sin contestar porque falta un dato de configuración sería
 * castigar al cliente por un detalle interno.
 */
export async function ajustesDeConexion(
  db: SupabaseClient,
  conversationId: string,
): Promise<AjustesDeConexion | null> {
  const { data, error } = await db
    .from('conversations')
    .select(
      'connection_id, connection:channel_connections(id, name, system_prompt, ai_enabled, cola_id)',
    )
    .eq('id', conversationId)
    .maybeSingle()

  if (error || !data) return null

  const c = (data as { connection?: unknown }).connection as
    | {
        id: string
        name: string | null
        system_prompt: string | null
        ai_enabled: boolean
        cola_id: string | null
      }
    | null
    | undefined

  if (!c) return null

  return {
    id: c.id,
    nombre: c.name,
    systemPrompt: c.system_prompt,
    aiEnabled: c.ai_enabled,
    colaId: c.cola_id,
  }
}

/**
 * El prompt que corresponde: el de la conexión si lo tiene, el de la cuenta
 * si no.
 *
 * Se compara contra vacío después de recortar, no contra null a secas. Un
 * prompt de solo espacios es lo que queda cuando alguien borra el texto de
 * un campo sin darle a limpiar, y tratarlo como «personalidad propia»
 * dejaría al agente sin ninguna instrucción — peor que no haberlo tocado.
 */
export function promptEfectivo(
  deLaConexion: string | null | undefined,
  deLaCuenta: string | null | undefined,
): string | null {
  const propio = deLaConexion?.trim()
  if (propio) return propio
  return deLaCuenta ?? null
}
