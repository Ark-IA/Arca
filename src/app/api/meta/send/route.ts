/**
 * Responder por Messenger o Instagram desde la bandeja.
 *
 * El equivalente de `/api/whatsapp/send` para los canales de Meta. Va
 * aparte porque el contrato con la API es distinto: alla el destinatario es
 * un telefono o un BSUID y la ruta cuelga del numero; aca el destinatario es
 * un PSID/IGSID y la ruta cuelga de la pagina o la cuenta de Instagram.
 */

import { NextResponse } from 'next/server'
// Mismo guardian que usa el envio de WhatsApp: exige rol 'agent' o superior
// y devuelve la organizacion del usuario. Compartirlo evita que un canal
// termine con reglas de permiso distintas al otro.
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { enviarMensaje, tipoMediaMeta } from '@/lib/meta/mensajeria'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let accountId: string
  let userId: string
  try {
    const ctx = await requireRole('agent')
    accountId = ctx.accountId
    userId = ctx.userId
  } catch (e) {
    return toErrorResponse(e)
  }

  let cuerpo: {
    conversationId?: string
    text?: string
    /** Adjunto opcional. La URL tiene que ser publica: Meta la descarga. */
    mediaUrl?: string
    /** Tipo interno del CRM: image | video | audio | document. */
    contentType?: string
  }
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido' }, { status: 400 })
  }

  const { conversationId, text, mediaUrl, contentType } = cuerpo
  // Hace falta texto O un adjunto. Un mensaje sin ninguno de los dos no
  // existe para Meta y devolveria un error que no explica nada.
  if (!conversationId || (!text?.trim() && !mediaUrl)) {
    return NextResponse.json(
      { error: 'Falta la conversacion o el contenido del mensaje' },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()

  const { data: conversacion } = await db
    .from('conversations')
    .select('*, contact:contacts(*), connection:channel_connections(*)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (!conversacion) {
    return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
  }

  const canal = conversacion.channel
  if (canal !== 'facebook' && canal !== 'instagram') {
    return NextResponse.json(
      { error: `Esta conversacion es de ${canal}: usa el envio de ese canal.` },
      { status: 400 },
    )
  }

  const conexion = conversacion.connection
  if (!conexion) {
    return NextResponse.json(
      { error: 'La cuenta de este canal ya no esta conectada.' },
      { status: 400 },
    )
  }

  const destinatario =
    canal === 'facebook'
      ? conversacion.contact?.facebook_id
      : conversacion.contact?.instagram_id

  if (!destinatario) {
    return NextResponse.json(
      {
        error: `El contacto no tiene identificador de ${canal}: no hay a donde responder.`,
      },
      { status: 400 },
    )
  }

  // La fila se crea ANTES de llamar a Meta, en estado 'sending'. Si la
  // llamada falla, queda registro de que se intento; crearla despues haria
  // desaparecer de la pantalla los mensajes que no salieron.
  const tipo = mediaUrl ? (contentType ?? 'document') : 'text'

  const { data: fila } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_id: userId,
      content_type: tipo,
      content_text: text ?? null,
      media_url: mediaUrl ?? null,
      status: 'sending',
    })
    .select()
    .single()

  try {
    const token = decrypt(conexion.access_token)

    const resultado = await enviarMensaje({
      cuentaId: conexion.external_id,
      accessToken: token,
      destinatario,
      texto: text ?? '',
      ...(mediaUrl
        ? { media: { url: mediaUrl, tipo: tipoMediaMeta(tipo) } }
        : {}),
    })

    // El pie de foto va como un SEGUNDO mensaje.
    //
    // Meta ignora el texto cuando el cuerpo lleva adjunto, asi que mandar
    // ambos juntos haria desaparecer el pie sin ningun error. Se envia aparte
    // y se tolera que falle: el archivo, que es lo importante, ya salio.
    if (mediaUrl && text?.trim()) {
      try {
        await enviarMensaje({
          cuentaId: conexion.external_id,
          accessToken: token,
          destinatario,
          texto: text,
        })
      } catch (e) {
        console.error(
          '[meta send] el adjunto salio pero el pie de foto no:',
          e instanceof Error ? e.message : e,
        )
      }
    }

    await db
      .from('messages')
      .update({ status: 'sent', message_id: resultado.messageId })
      .eq('id', fila!.id)

    await db
      .from('conversations')
      .update({
        last_message_text: text?.trim() || `[${tipo}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    return NextResponse.json({ ok: true, messageId: resultado.messageId })
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'Error desconocido'
    await db
      .from('messages')
      .update({ status: 'failed', error_detail: motivo })
      .eq('id', fila!.id)
    console.error(`[meta send] ${canal} fallo:`, motivo)
    return NextResponse.json({ error: motivo }, { status: 502 })
  }
}
