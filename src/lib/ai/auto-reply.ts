import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext, esDescripcionDeMedios } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { responderPorCanal } from './enviar-por-canal'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import type { Canal } from '@/types'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Eligibility gates (any → silent no-op):
 *   - AI off / auto-reply disabled for the account
 *   - a human agent is assigned (they own the thread)
 *   - auto-reply was disabled for this conversation (prior handoff)
 *   - the per-conversation reply cap is reached
 *   - there's nothing to reply to
 *
 * The 24h WhatsApp session window is inherently open here — we're
 * reacting to a customer message that just landed — so no separate
 * window check is needed.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig(db, accountId)
    if (!config || !config.autoReplyEnabled) return

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1)
    if (autoResponders && autoResponders.length > 0) return

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count, channel')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here

    // Canal apagado para el agente.
    //
    // Las conversaciones anteriores a los canales multiples no traen el campo
    // y son de WhatsApp: sin ese valor por defecto, encender la lista dejaria
    // muda a toda la bandeja historica.
    const canal = (conv.channel ?? 'whatsapp') as Canal
    if (!config.autoReplyChannels.includes(canal)) return
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) return

    const messages = await buildConversationContext(db, conversationId)
    if (messages.length === 0) return

    // Account-wide throttle on the shared BYO key. The per-conversation
    // cap bounds one thread; this bounds a burst across many threads (a
    // marketing blast landing 200 replies at once) so we never run the
    // owner's key past the provider's rate limit. Over the limit → skip
    // the auto-reply; the inbound still sits in the inbox for a human.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // ------------------------------------------------------------
    // Nota de voz que no se pudo transcribir: se contesta sin modelo.
    // ------------------------------------------------------------
    //
    // La situación tiene UNA sola respuesta correcta —decir que no se puede
    // escuchar y pedir que lo escriban— así que preguntársela a un modelo es
    // gastar dinero, segundos y fiabilidad en una decisión ya tomada.
    //
    // Y decidía mal. Con base de conocimiento activa, el último bloque del
    // prompt dice «si no cubren la pregunta, no adivines: escalá», y una
    // descripción de audio no está cubierta por ninguna documentación: el
    // modelo escalaba a un humano porque el cliente había hablado en vez de
    // escribir. Se vio en producción, con su fila de consumo y todo.
    const ultimoDelCliente = latestUserMessage(messages)
    if (esDescripcionDeMedios(ultimoDelCliente)) {
      const respuesta = config.unsupportedMediaMessage?.trim()
      if (!respuesta) return

      // Sí gasta una respuesta del tope: es una respuesta al cliente como
      // cualquier otra, y sin contarla alguien que mande audios en cadena
      // recibiría respuestas sin límite.
      const { data: claimed } = await db.rpc('claim_ai_reply_slot', {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      })
      if (claimed !== true) return

      await responderPorCanal({
        db,
        accountId,
        configOwnerUserId,
        conversationId,
        contactId,
        canal,
        texto: respuesta,
      })
      return
    }

    // Ground the reply in the account's knowledge base (best-effort).
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      ultimoDelCliente,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key. Fire-and-forget so it
    // never adds latency to the customer-facing send: `logAiUsage`
    // swallows its own errors, so the floating promise can't reject.
    // Logged regardless of handoff — the provider call happened either
    // way.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human. We (a) pause the bot here
      // (sticky until re-enabled), (b) route the conversation to the
      // configured handoff agent — null leaves it in the shared queue —
      // and (c) leave a short internal note so whoever picks it up has
      // context. Assigning fires the `on_conversation_assigned` trigger,
      // which notifies the agent.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      // Only set the assignee when a target is configured AND the thread
      // isn't already owned — never stomp an existing human assignment.
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)

      // Y se le avisa al cliente.
      //
      // Antes esta rama no le mandaba nada: pausaba el bot, dejaba el resumen
      // y devolvía. Desde el lado de quien escribió eso es indistinguible de
      // que el sistema esté roto — mandó un mensaje y no pasó nada — y el
      // humano puede tardar minutos u horas en aparecer.
      //
      // Se manda exactamente UNA vez por escalada: más arriba está la
      // compuerta `if (conv.ai_autoreply_disabled) return`, así que llegar
      // hasta acá significa que la conversación NO estaba pausada todavía.
      // Es la transición, no el estado. Si el cliente sigue escribiendo
      // mientras espera, esos mensajes salen por la compuerta y no repiten
      // el aviso.
      const aviso = config.handoffMessage?.trim()
      if (aviso) {
        try {
          await responderPorCanal({
            db,
            accountId,
            configOwnerUserId,
            conversationId,
            contactId,
            canal,
            texto: aviso,
          })
        } catch (e) {
          // Que no se pueda avisar no puede deshacer la escalada: la
          // conversación ya está en manos de una persona, que es lo que
          // importa. Se registra y se sigue.
          console.error('[ai auto-reply] no se pudo avisar de la escalada:', e)
        }
      }
      return
    }

    // Atomically claim a reply slot: the cap check + increment happen in
    // one UPDATE, so concurrent inbounds can never overshoot the cap. If
    // another inbound just took the last slot, `claimed` is false and we
    // skip the send. (We consume a slot slightly before the send lands —
    // fail-safe: under-reply rather than over-reply.)
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      // A real error here (vs. losing the cap race) is almost always a
      // deploy issue — e.g. `claim_ai_reply_slot` not EXECUTE-able by the
      // service role, or the migration not applied. Log it loudly: a
      // silent return makes "auto-reply never fires" undiagnosable.
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return // lost the per-conversation cap race

    await responderPorCanal({
      db,
      accountId,
      configOwnerUserId,
      conversationId,
      contactId,
      canal,
      texto: text,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}
