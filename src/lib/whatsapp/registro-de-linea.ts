/**
 * Anotar una línea de WhatsApp en el registro de conexiones.
 *
 * `whatsapp_config` guarda el detalle técnico de cada línea —el
 * identificador del número, el token, si Meta la tiene registrada—. Lo que
 * la operación necesita saber de ella vive en otro lado: cómo se llama, con
 * qué prompt responde el agente, a qué cola entran sus conversaciones. Eso
 * está en `channel_connections`, que es el registro común de WhatsApp,
 * Facebook e Instagram.
 *
 * Las dos filas tienen que nacer juntas. Si se guarda la línea y no se
 * registra la conexión, la línea funciona —envía y recibe— pero no aparece
 * en la pantalla de Conexiones, así que no hay dónde escribirle su prompt y
 * el agente contesta con el de la cuenta. El síntoma es desconcertante:
 * todo anda, salvo que el agente comercial responde como el de soporte.
 *
 * Se usa la clave `(account_id, channel, external_id)` para que volver a
 * guardar la misma línea actualice en vez de duplicar.
 */

import { supabaseAdmin } from '@/lib/flows/admin-client'

export interface LineaARegistrar {
  accountId: string
  userId: string
  /** El id de la fila de `whatsapp_config`, que queda apuntando a la conexión. */
  filaId: string
  phoneNumberId: string
  nombreSugerido?: string | null
  accessTokenCifrado: string
  verifyTokenCifrado: string | null
  conectada: boolean
  ultimoError: string | null
}

export async function registrarConexionDeWhatsApp(
  linea: LineaARegistrar,
): Promise<string | null> {
  const db = supabaseAdmin()

  // ¿Ya estaba registrada esta línea? El nombre que tenga se conserva: si
  // alguien la llamó «Ventas Bogotá», rotar el token no debe devolverla a
  // «WhatsApp 2».
  const { data: yaEstaba } = await db
    .from('channel_connections')
    .select('id, name')
    .eq('account_id', linea.accountId)
    .eq('channel', 'whatsapp')
    .eq('external_id', linea.phoneNumberId)
    .maybeSingle()

  // Se cuenta lo que hay para proponer un nombre que distinga. «WhatsApp» a
  // secas en tres líneas obliga a abrir cada una para saber cuál es cuál.
  const { count } = await db
    .from('channel_connections')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', linea.accountId)
    .eq('channel', 'whatsapp')

  const nombre =
    linea.nombreSugerido?.trim() ||
    yaEstaba?.name ||
    (count && count > 0 ? `WhatsApp ${count + 1}` : 'WhatsApp principal')

  const { data, error } = await db
    .from('channel_connections')
    .upsert(
      {
        account_id: linea.accountId,
        user_id: linea.userId,
        channel: 'whatsapp',
        external_id: linea.phoneNumberId,
        name: nombre,
        access_token: linea.accessTokenCifrado,
        verify_token: linea.verifyTokenCifrado,
        status: linea.conectada ? 'connected' : 'disconnected',
        last_error: linea.ultimoError,
        connected_at: linea.conectada ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,channel,external_id' },
    )
    .select('id, name')
    .single()

  if (error || !data) {
    // No se interrumpe el guardado por esto: la línea ya quedó operativa y
    // perder el registro es un problema de pantalla, no de mensajería.
    console.error(
      '[registro de linea] no se pudo anotar la conexion:',
      error?.message ?? 'sin fila',
    )
    return null
  }

  await db
    .from('whatsapp_config')
    .update({ connection_id: data.id })
    .eq('id', linea.filaId)

  return data.id as string
}
