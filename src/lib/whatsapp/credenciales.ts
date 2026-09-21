/**
 * De QUÉ línea de WhatsApp salen las credenciales.
 *
 * Mientras hubo una sola línea por cuenta, todo el código preguntaba lo
 * mismo:
 *
 *     .from('whatsapp_config').eq('account_id', accountId).single()
 *
 * Con dos líneas esa consulta deja de devolver una fila y devuelve un error
 * — `.single()` exige exactamente una — así que el envío no elige mal: deja
 * de funcionar por completo, y el mensaje que llega a la pantalla es
 * «WhatsApp no está configurado», que manda a revisar justo lo que sí está
 * bien. Por eso la corrección no es opcional ni cosmética: sin ella, dar de
 * alta la segunda línea apaga la primera.
 *
 * Este módulo es el único sitio que responde la pregunta, y la responde en
 * dos pasos:
 *
 *   1. Si se sabe de qué conversación se trata, se usa LA LÍNEA POR LA QUE
 *      entró esa conversación. Es lo que espera el cliente: escribió al
 *      número de ventas y ventas le contesta, no soporte.
 *
 *   2. Si no se sabe (una plantilla que se sincroniza, una difusión, la
 *      pantalla de ajustes), se toma la más antigua de la cuenta. Es
 *      arbitrario pero es ESTABLE: la misma cuenta da siempre la misma
 *      respuesta, y así el comportamiento no cambia de una llamada a otra.
 *
 * El paso 1 cae al paso 2 cuando la conversación no tiene línea anotada
 * —las de antes de esta función no la tienen— en vez de fallar. Antes esas
 * conversaciones se atendían con la única línea que había; seguir usando la
 * primera es exactamente lo que venía pasando.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>

export interface OpcionesDeCredenciales {
  /** La conversación que se está atendiendo, si el sitio que llama la sabe. */
  conversationId?: string | null
  /** La conexión ya resuelta, si el sitio que llama ya la tenía a mano. */
  connectionId?: string | null
  /** Columnas a traer. Por omisión, todas. */
  columnas?: string
}

/**
 * La fila de `whatsapp_config` que corresponde usar.
 *
 * Devuelve `null` en vez de lanzar: cada sitio que llama ya tiene su propia
 * forma de contar que WhatsApp no está configurado (unos devuelven 400,
 * otros lanzan, otros lo ignoran) y unificarla acá obligaría a tocar los
 * veinte.
 */
export async function configDeWhatsApp(
  db: Db,
  accountId: string,
  opciones: OpcionesDeCredenciales = {},
): Promise<Record<string, any> | null> {
  const columnas = opciones.columnas ?? '*'

  let conexion = opciones.connectionId ?? null

  if (!conexion && opciones.conversationId) {
    const { data } = await db
      .from('conversations')
      .select('connection_id')
      .eq('id', opciones.conversationId)
      .eq('account_id', accountId)
      .maybeSingle()
    conexion = (data as { connection_id?: string | null } | null)?.connection_id ?? null
  }

  if (conexion) {
    const { data } = await db
      .from('whatsapp_config')
      .select(columnas)
      .eq('account_id', accountId)
      .eq('connection_id', conexion)
      .limit(1)
      .maybeSingle()
    // Si la conexión existe pero no tiene credenciales cargadas se sigue al
    // respaldo en lugar de rendirse: es preferible responder por otra línea
    // a no responder. Queda anotado en el registro porque es un estado que
    // hay que arreglar, no uno normal.
    if (data) return data as Record<string, any>
    console.warn(
      `[whatsapp credenciales] la conexion ${conexion} no tiene credenciales; se usa la principal de la cuenta`,
    )
  }

  const { data } = await db
    .from('whatsapp_config')
    .select(columnas)
    .eq('account_id', accountId)
    // `created_at` y no `id`: el orden por identificador aleatorio cambiaría
    // la "principal" cada vez que se agrega una línea.
    .order('created_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle()

  return (data as Record<string, any>) ?? null
}
