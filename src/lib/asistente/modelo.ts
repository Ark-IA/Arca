/**
 * Una vuelta del modelo con herramientas ("tool calling"): se le pasa la
 * conversación y el catálogo, y contesta con texto, con llamadas a
 * herramientas o con las dos cosas.
 *
 * Vive aparte de `generateReply` a propósito: aquel mueve las respuestas
 * automáticas de WhatsApp, que funcionan, y un cambio de formato ahí se paga
 * con clientes sin respuesta. Este solo lo usa el asistente.
 *
 * Habla los dos formatos que existen en la práctica:
 *   - OpenAI "chat completions" (OpenAI y OpenRouter)
 *   - Anthropic "messages"
 */

import type { AiConfig } from '@/lib/ai/types';
import type { Herramienta } from './herramientas';

export interface Llamada {
  id: string;
  nombre: string;
  args: Record<string, unknown>;
}

export type Mensaje =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; texto: string | null; llamadas?: Llamada[] }
  | { rol: 'herramienta'; id: string; nombre: string; resultado: string };

export interface Paso {
  texto: string | null;
  llamadas: Llamada[];
}

const TIEMPO_LIMITE_MS = 60_000;
const MAX_TOKENS = 1200;

export async function pasoDelModelo(args: {
  config: Pick<AiConfig, 'provider' | 'model' | 'apiKey'>;
  sistema: string;
  mensajes: Mensaje[];
  herramientas: Herramienta[];
}): Promise<Paso> {
  return args.config.provider === 'anthropic'
    ? anthropic(args)
    : chatCompletions(args);
}

function argsDe(crudo: unknown): Record<string, unknown> {
  if (crudo && typeof crudo === 'object')
    return crudo as Record<string, unknown>;
  if (typeof crudo === 'string') {
    try {
      const v = JSON.parse(crudo);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function pedir(
  url: string,
  cabeceras: Record<string, string>,
  cuerpo: unknown
): Promise<unknown> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    const msg =
      (datos as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${r.status}`;
    throw new Error(`el proveedor de IA respondió: ${msg}`);
  }
  return datos;
}

// ------------------------------------------------------------------
// OpenAI / OpenRouter
// ------------------------------------------------------------------

async function chatCompletions({
  config,
  sistema,
  mensajes,
  herramientas,
}: Parameters<typeof pasoDelModelo>[0]): Promise<Paso> {
  const url =
    config.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

  const cuerpoMensajes: unknown[] = [{ role: 'system', content: sistema }];
  for (const m of mensajes) {
    if (m.rol === 'usuario')
      cuerpoMensajes.push({ role: 'user', content: m.texto });
    else if (m.rol === 'asistente')
      cuerpoMensajes.push({
        role: 'assistant',
        content: m.texto ?? null,
        ...(m.llamadas?.length
          ? {
              tool_calls: m.llamadas.map((l) => ({
                id: l.id,
                type: 'function',
                function: { name: l.nombre, arguments: JSON.stringify(l.args) },
              })),
            }
          : {}),
      });
    else
      cuerpoMensajes.push({
        role: 'tool',
        tool_call_id: m.id,
        content: m.resultado,
      });
  }

  const datos = (await pedir(
    url,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      messages: cuerpoMensajes,
      tools: herramientas.map((h) => ({
        type: 'function',
        function: {
          name: h.nombre,
          description: h.descripcion,
          parameters: h.parametros,
        },
      })),
      max_completion_tokens: MAX_TOKENS,
    }
  )) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          id: string;
          function: { name: string; arguments: string };
        }[];
      };
    }[];
  };

  const msg = datos.choices?.[0]?.message;
  return {
    texto: msg?.content?.trim() || null,
    llamadas: (msg?.tool_calls ?? []).map((t) => ({
      id: t.id,
      nombre: t.function.name,
      args: argsDe(t.function.arguments),
    })),
  };
}

// ------------------------------------------------------------------
// Anthropic
// ------------------------------------------------------------------

async function anthropic({
  config,
  sistema,
  mensajes,
  herramientas,
}: Parameters<typeof pasoDelModelo>[0]): Promise<Paso> {
  // Anthropic exige alternar usuario/asistente y que los resultados de
  // herramientas viajen como bloques `tool_result` dentro de UN mensaje de
  // usuario, así que los resultados consecutivos se agrupan.
  const cuerpoMensajes: { role: 'user' | 'assistant'; content: unknown[] }[] =
    [];
  const agregar = (role: 'user' | 'assistant', bloque: unknown) => {
    const ultimo = cuerpoMensajes[cuerpoMensajes.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content.push(bloque);
    else cuerpoMensajes.push({ role, content: [bloque] });
  };
  for (const m of mensajes) {
    if (m.rol === 'usuario') agregar('user', { type: 'text', text: m.texto });
    else if (m.rol === 'asistente') {
      if (m.texto) agregar('assistant', { type: 'text', text: m.texto });
      for (const l of m.llamadas ?? [])
        agregar('assistant', {
          type: 'tool_use',
          id: l.id,
          name: l.nombre,
          input: l.args,
        });
    } else
      agregar('user', {
        type: 'tool_result',
        tool_use_id: m.id,
        content: m.resultado,
      });
  }

  const datos = (await pedir(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
    {
      model: config.model,
      system: sistema,
      messages: cuerpoMensajes,
      tools: herramientas.map((h) => ({
        name: h.nombre,
        description: h.descripcion,
        input_schema: h.parametros,
      })),
      max_tokens: MAX_TOKENS,
    }
  )) as {
    content?: (
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
    )[];
  };

  const bloques = datos.content ?? [];
  const texto = bloques
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return {
    texto: texto || null,
    llamadas: bloques
      .filter(
        (
          b
        ): b is {
          type: 'tool_use';
          id: string;
          name: string;
          input: unknown;
        } => b.type === 'tool_use'
      )
      .map((b) => ({ id: b.id, nombre: b.name, args: argsDe(b.input) })),
  };
}
