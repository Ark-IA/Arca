import type { ProviderResult } from '../types'
import { generarChatCompletions } from './chat-completions'
import type { ProviderArgs } from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateOpenAi(args: ProviderArgs): Promise<ProviderResult> {
  return generarChatCompletions({ ...args, url: OPENAI_URL, nombre: 'OpenAI' })
}
