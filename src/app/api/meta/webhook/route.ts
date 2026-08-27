/**
 * Webhook de Facebook Messenger e Instagram.
 *
 * Vive aparte del de WhatsApp (`/api/whatsapp/webhook`) porque son productos
 * distintos en Meta, con su propia configuracion de webhook y su propio
 * formato de evento. Mezclarlos en una ruta obligaria a ramificar en la
 * primera linea y a que un cambio en un canal pudiera romper el otro.
 *
 * Un mismo endpoint SI atiende a los dos canales nuevos, porque comparten
 * estructura: el campo `object` dice cual es.
 */

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { textoDeAudioEntrante } from '@/lib/ai/audio-entrante'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import {
  canalDesdeObjeto,
  perfilDeUsuario,
  type CanalMeta,
  type EntradaWebhookMeta,
  type MensajeEntranteMeta,
} from '@/lib/meta/mensajeria'

export const dynamic = 'force-dynamic'

// ============================================================
// GET — verificacion
// ============================================================
//
// Meta llama una vez con un desafio al conectar el webhook. Se compara
// contra el verify_token de las conexiones guardadas, igual que en WhatsApp.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const modo = searchParams.get('hub.mode')
  const desafio = searchParams.get('hub.challenge')
  const token = searchParams.get('hub.verify_token')

  if (modo !== 'subscribe' || !token) {
    return NextResponse.json({ error: 'Peticion de verificacion invalida' }, { status: 400 })
  }

  // La variable de entorno es el camino normal: al conectar el webhook en
  // Meta todavia no existe ninguna conexion guardada, asi que no habria
  // contra que comparar. Es el problema del huevo y la gallina.
  const tokenDeEntorno = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (tokenDeEntorno && token === tokenDeEntorno) {
    return new Response(desafio ?? '', { status: 200 })
  }

  // Alternativa: alguna conexion ya guardada con ese token.
  const { data: conexiones } = await supabaseAdmin()
    .from('channel_connections')
    .select('verify_token')
    .not('verify_token', 'is', null)

  for (const c of conexiones ?? []) {
    try {
      if (c.verify_token && decrypt(c.verify_token) === token) {
        return new Response(desafio ?? '', { status: 200 })
      }
    } catch {
      // Un token que no descifra (ENCRYPTION_KEY rotada) no debe tumbar la
      // verificacion de los demas.
    }
  }

  return NextResponse.json({ error: 'Token de verificacion invalido' }, { status: 403 })
}

// ============================================================
// POST — mensajes
// ============================================================

export async function POST(request: Request) {
  const crudo = await request.text()

  // Meta firma cada envio. Sin comprobarlo, cualquiera que conozca la URL
  // puede inyectar mensajes falsos en las bandejas de los clientes.
  const firma = request.headers.get('x-hub-signature-256')
  const secreto = process.env.META_APP_SECRET
  if (secreto) {
    if (!firmaValida(crudo, firma, secreto)) {
      console.error('[meta webhook] firma invalida — evento descartado')
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 })
    }
  } else {
    console.warn('[meta webhook] META_APP_SECRET sin definir: no se verifica la firma')
  }

  let cuerpo: EntradaWebhookMeta
  try {
    cuerpo = JSON.parse(crudo)
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido' }, { status: 400 })
  }

  const canal = canalDesdeObjeto(cuerpo.object)
  if (!canal) {
    // Otro producto de Meta que comparte la URL. No es un error.
    return NextResponse.json({ ok: true, ignorado: cuerpo.object })
  }

  // Se responde 200 aunque algo falle adentro: Meta reintenta durante horas
  // y desactiva el webhook si acumula errores. Los problemas se registran,
  // no se devuelven.
  try {
    for (const entrada of cuerpo.entry ?? []) {
      for (const evento of entrada.messaging ?? []) {
        await procesarEvento(canal, entrada.id, evento)
      }
    }
  } catch (e) {
    console.error('[meta webhook] error procesando:', e)
  }

  return NextResponse.json({ ok: true })
}

function firmaValida(crudo: string, cabecera: string | null, secreto: string): boolean {
  if (!cabecera?.startsWith('sha256=')) return false
  const esperada = crypto.createHmac('sha256', secreto).update(crudo).digest('hex')
  const recibida = cabecera.slice(7)
  // Comparacion en tiempo constante: comparar con === filtra el secreto por
  // el tiempo de respuesta.
  const a = Buffer.from(esperada, 'utf8')
  const b = Buffer.from(recibida, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function procesarEvento(
  canal: CanalMeta,
  cuentaId: string,
  evento: MensajeEntranteMeta,
) {
  // Los ecos son nuestros propios mensajes rebotando. Guardarlos duplicaria
  // cada respuesta en la conversacion.
  if (!evento.message || evento.message.is_echo) return

  const db = supabaseAdmin()

  const { data: conexion } = await db
    .from('channel_connections')
    .select('*')
    .eq('channel', canal)
    .eq('external_id', cuentaId)
    .eq('status', 'connected')
    .maybeSingle()

  if (!conexion) {
    console.error(`[meta webhook] llego un mensaje de ${canal}/${cuentaId} sin conexion registrada`)
    return
  }

  const remitente = evento.sender.id
  const columnaId = canal === 'facebook' ? 'facebook_id' : 'instagram_id'

  let accessToken: string
  try {
    accessToken = decrypt(conexion.access_token)
  } catch (e) {
    console.error(`[meta webhook] no se pudo descifrar el token de ${canal}:`, e)
    return
  }

  // ---- contacto ----
  let { data: contacto } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', conexion.account_id)
    .eq(columnaId, remitente)
    .maybeSingle()

  if (!contacto) {
    const perfil = await perfilDeUsuario(canal, remitente, accessToken)
    const { data: nuevo, error } = await db
      .from('contacts')
      .insert({
        account_id: conexion.account_id,
        user_id: conexion.user_id,
        [columnaId]: remitente,
        name: perfil.nombre ?? `${canal === 'facebook' ? 'Messenger' : 'Instagram'} ${remitente.slice(-6)}`,
        avatar_url: perfil.foto ?? null,
      })
      .select()
      .single()
    if (error) {
      console.error('[meta webhook] no se pudo crear el contacto:', error.message)
      return
    }
    contacto = nuevo
  }

  // ---- conversacion ----
  // Se busca acotando POR CANAL: la misma persona escribiendo por Messenger
  // y por Instagram tiene dos conversaciones, que es justo lo que permite
  // medir cada canal por separado.
  let { data: conversacion } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', conexion.account_id)
    .eq('contact_id', contacto.id)
    .eq('channel', canal)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const texto = evento.message.text ?? textoDeAdjunto(evento)

  if (!conversacion) {
    const { data: nueva, error } = await db
      .from('conversations')
      .insert({
        account_id: conexion.account_id,
        user_id: conexion.user_id,
        contact_id: contacto.id,
        channel: canal,
        connection_id: conexion.id,
        status: 'open',
        last_message_text: texto,
        last_message_at: new Date(evento.timestamp).toISOString(),
        unread_count: 1,
      })
      .select()
      .single()
    if (error) {
      console.error('[meta webhook] no se pudo crear la conversacion:', error.message)
      return
    }
    conversacion = nueva
  } else {
    await db
      .from('conversations')
      .update({
        last_message_text: texto,
        last_message_at: new Date(evento.timestamp).toISOString(),
        unread_count: (conversacion.unread_count ?? 0) + 1,
        status: conversacion.status === 'closed' ? 'open' : conversacion.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversacion.id)
  }

  // ---- mensaje ----
  const adjunto = evento.message.attachments?.[0]
  const { error: errMsg } = await db.from('messages').insert({
    conversation_id: conversacion.id,
    sender_type: 'customer',
    content_type: adjunto ? tipoDeContenido(adjunto.type) : 'text',
    content_text: texto,
    media_url: adjunto?.payload?.url ?? null,
    message_id: evento.message.mid,
    status: 'delivered',
    created_at: new Date(evento.timestamp).toISOString(),
  })

  if (errMsg) {
    // 23505 = clave duplicada. Meta reintenta las entregas, asi que ver el
    // mismo mid dos veces es normal y no es un problema.
    if (errMsg.code !== '23505') {
      console.error('[meta webhook] no se pudo guardar el mensaje:', errMsg.message)
    }
    // Un duplicado NO sigue adelante: si lo hiciera, cada reintento de Meta
    // dispararia otra respuesta del agente y el cliente recibiria la misma
    // contestacion tres veces.
    return
  }

  // ---- notas de voz ----
  //
  // Se transcriben ANTES de repartir el mensaje, igual que en WhatsApp.
  // Los flujos buscan palabras y las automatizaciones de palabra clave
  // comparan texto: transcribir después dejaría al cliente sin respuesta.
  //
  // Y hay algo propio de este canal. Un adjunto entra con un texto de
  // relleno —«[Audio]»— que existe para que la bandeja muestre algo en la
  // vista previa. Ese relleno NO puede llegar al motor: no es nada que el
  // cliente haya dicho, y una palabra clave que por casualidad coincidiera
  // con él dispararía un flujo que nadie pidió.
  let textoParaElMotor = adjunto ? '' : texto

  if (adjunto?.type === 'audio' && adjunto.payload?.url) {
    const { data: guardado } = await db
      .from('messages')
      .select('id')
      .eq('message_id', evento.message.mid)
      .maybeSingle()
    const idGuardado = (guardado as { id: string } | null)?.id
    if (idGuardado) {
      textoParaElMotor = await textoDeAudioEntrante({
        accountId: conexion.account_id,
        messageId: idGuardado,
        mediaUrl: adjunto.payload.url,
        // Meta no dice el tipo exacto del adjunto de voz; se deja que lo
        // deduzca el propio transcriptor a partir de la extensión.
        mediaType: null,
        textoActual: '',
      })
    }
  }

  // ---- flujos, automatizaciones y agente de IA ----
  //
  // El MISMO orden que en el webhook de WhatsApp, y no por simetría estética:
  // lo determinista tiene que ganar sobre lo probabilístico, o el cliente
  // recibe dos respuestas a la misma pregunta. Si los dos webhooks
  // resolvieran distinto, el mismo escenario se comportaría de una forma en
  // WhatsApp y de otra en Messenger, que es imposible de explicar y peor de
  // depurar.
  //
  //   1. flujos          → si consumen el mensaje, nadie más contesta
  //   2. automatizaciones → siempre corren (etiquetas, negocios, avisos)
  //   3. agente de IA    → solo si ningún flujo consumió

  // El identificador de la opción tocada. En Messenger llega como
  // `quick_reply.payload` o como `postback.payload`; es el equivalente del
  // `button_reply.id` de WhatsApp y lo que hace avanzar el flujo.
  const idOpcion =
    evento.message?.quick_reply?.payload ?? evento.postback?.payload ?? null

  /**
   * ¿Es el primer mensaje que manda esta persona?
   *
   * Lo necesita el disparador `first_inbound_message`, que es el que arranca
   * el flujo de recepción. Se cuenta sobre los mensajes ya guardados: el
   * recién insertado va incluido, así que "primero" es exactamente uno.
   *
   * Se cuenta por CONTACTO y no por conversación: si alguien escribió hace
   * meses, se cerró la conversación y vuelve, no es su primer contacto y no
   * corresponde darle otra vez la bienvenida.
   */
  const { count: mensajesDelCliente } = await db
    .from('messages')
    .select('id, conversations!inner(contact_id)', { count: 'exact', head: true })
    .eq('sender_type', 'customer')
    .eq('conversations.contact_id', contacto.id)

  let consumidoPorFlujo = false
  try {
    const r = await dispatchInboundToFlows({
      accountId: conexion.account_id,
      userId: conexion.user_id ?? conexion.account_id,
      contactId: contacto.id,
      conversationId: conversacion.id,
      isFirstInboundMessage: (mensajesDelCliente ?? 0) <= 1,
      // Facebook o Instagram según el `object` del webhook. El motor lo usa
      // para descartar los flujos que el usuario apagó en este canal.
      channel: canal,
      message: idOpcion
        ? {
            kind: 'interactive_reply',
            reply_id: idOpcion,
            reply_title: evento.postback?.title ?? textoParaElMotor,
            meta_message_id: evento.message?.mid ?? evento.postback?.mid ?? '',
          }
        : {
            kind: 'text',
            text: textoParaElMotor,
            // El identificador del mensaje es lo que hace el motor
            // idempotente: Meta reintenta las entregas, y sin él el mismo
            // mensaje haria avanzar el flujo dos veces.
            meta_message_id: evento.message?.mid ?? '',
          },
    })
    consumidoPorFlujo = r?.consumed === true
  } catch (e) {
    console.error('[meta webhook] el motor de flujos fallo:', e)
  }

  // Las automatizaciones corren aunque el flujo haya consumido: hacen cosas
  // que no son responder (etiquetar, crear un negocio, asignar), y saltárselas
  // dejaría el CRM sin registrar lo que acaba de pasar.
  for (const disparador of ['new_message_received', 'keyword_match'] as const) {
    await runAutomationsForTrigger({
      accountId: conexion.account_id,
      triggerType: disparador,
      contactId: contacto.id,
      context: {
        message_text: textoParaElMotor,
        conversation_id: conversacion.id,
        ...(idOpcion ? { interactive_reply_id: idOpcion } : {}),
      },
    }).catch((e) =>
      console.error(`[meta webhook] automatizacion ${disparador} fallo:`, e),
    )
  }

  // ---- agente de IA ----
  //
  // Solo para mensajes de TEXTO. Un audio o una imagen llegan aca como
  // '[Imagen]', y hacer que el modelo conteste a esa etiqueta produce
  // respuestas sin sentido -- mejor que lo vea una persona.
  //
  // Va sin `await` y con su propio manejo de errores: la respuesta a Meta no
  // puede esperar a un modelo de lenguaje. Meta reintenta el webhook si
  // tarda mas de unos segundos, y cada reintento seria otro mensaje.
  if (!consumidoPorFlujo && !idOpcion && !adjunto && texto.trim() !== '') {
    void dispatchInboundToAiReply({
      accountId: conexion.account_id,
      conversationId: conversacion.id,
      contactId: contacto.id,
      configOwnerUserId: conexion.user_id ?? conexion.account_id,
    }).catch((e) => {
      console.error('[meta webhook] el agente de IA fallo:', e)
    })
  }
}

function textoDeAdjunto(evento: MensajeEntranteMeta): string {
  const a = evento.message?.attachments?.[0]
  if (!a) return ''
  const nombres: Record<string, string> = {
    image: '[Imagen]',
    video: '[Video]',
    audio: '[Audio]',
    file: '[Archivo]',
    location: '[Ubicacion]',
    share: '[Contenido compartido]',
    story_mention: '[Mencion en historia]',
  }
  return nombres[a.type] ?? '[Adjunto]'
}

function tipoDeContenido(tipo: string): string {
  if (tipo === 'image') return 'image'
  if (tipo === 'video') return 'video'
  if (tipo === 'audio') return 'audio'
  if (tipo === 'file') return 'document'
  return 'text'
}
