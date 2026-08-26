import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

// ============================================================
// El formato "chat completions" de OpenAI.
//
// No lo habla solo OpenAI: OpenRouter, Groq, Together, DeepSeek, vLLM y
// media docena mas exponen exactamente este endpoint con exactamente este
// cuerpo. Por eso vive aparte y no dentro de openai.ts: sumar un proveedor
// compatible se reduce a decir su direccion y sus cabeceras, en vez de
// copiar cincuenta lineas que despues se corrigen en un sitio y no en el
// otro.
// ============================================================

interface RespuestaChat {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  /** OpenRouter devuelve el error aca cuando el modelo pedido no existe. */
  error?: { message?: string }
}

export interface OpcionesChat extends ProviderArgs {
  /** URL completa del endpoint de chat. */
  url: string
  /** Nombre para los mensajes de error que ve la persona. */
  nombre: string
  /** Cabeceras propias del proveedor, ademas de la autorizacion. */
  cabeceras?: Record<string, string>
}

export async function generarChatCompletions(
  opciones: OpcionesChat,
): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, url, nombre } = opciones

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(opciones.cabeceras ?? {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages),
        ],
        max_completion_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError(nombre, res)
  }

  const data = (await res.json().catch(() => null)) as RespuestaChat | null

  // Un 200 con `error` dentro parece una respuesta correcta y no lo es.
  // OpenRouter lo hace cuando el modelo no existe o no esta disponible para
  // esa cuenta; sin este control el fallo se manifestaria como "respuesta
  // vacia", que manda a buscar el problema al sitio equivocado.
  if (data?.error?.message) {
    throw new AiError(`${nombre}: ${data.error.message}`, {
      code: 'provider_error',
      status: 502,
    })
  }

  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(`${nombre} devolvió una respuesta vacía.`, {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })
  return { text, usage }
}
