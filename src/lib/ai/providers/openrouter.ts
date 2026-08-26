import type { ProviderResult } from '../types'
import { generarChatCompletions } from './chat-completions'
import type { ProviderArgs } from './shared'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * OpenRouter.
 *
 * No es un modelo: es un intermediario que da acceso con UNA sola clave a
 * los modelos de OpenAI, Anthropic, Google, Meta, Mistral y demas. Para el
 * CRM eso significa que cambiar de modelo -- porque salio uno mejor, porque
 * el actual subio de precio, porque uno responde mejor en español -- es
 * editar un campo de texto, no dar de alta otra cuenta y otra tarjeta.
 *
 * Habla el mismo formato que OpenAI, asi que solo cambian la direccion y dos
 * cabeceras.
 *
 * Los identificadores de modelo llevan el proveedor delante:
 *   anthropic/claude-sonnet-4.5
 *   openai/gpt-4o-mini
 *   google/gemini-2.0-flash-001
 *   meta-llama/llama-3.3-70b-instruct
 */
export async function generateOpenRouter(args: ProviderArgs): Promise<ProviderResult> {
  return generarChatCompletions({
    ...args,
    url: OPENROUTER_URL,
    nombre: 'OpenRouter',
    // OpenRouter usa estas dos para identificar de donde viene el trafico y
    // atribuirlo en su panel. Son opcionales, pero sin ellas todas las
    // llamadas aparecen como "desconocido" y no hay forma de repartir el
    // gasto entre lo que consume el CRM y cualquier otra cosa que use la
    // misma clave.
    cabeceras: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.ark-ia.com',
      'X-Title': 'ARK-IA Enterprise',
    },
  })
}
