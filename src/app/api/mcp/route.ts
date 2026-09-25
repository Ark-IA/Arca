/**
 * Servidor MCP de ARCA por HTTP (Model Context Protocol, transporte
 * "Streamable HTTP" en modo sin estado).
 *
 * Para conectar Claude, ChatGPT, Cursor u otro cliente MCP a esta
 * instalación sin instalar nada: URL `https://<instalación>/api/mcp` y la
 * cabecera `Authorization: Bearer <clave de API>` (Configuración → API keys).
 *
 * Las herramientas son las mismas del asistente de voz
 * (src/lib/asistente/herramientas.ts). Cada una exige el permiso de la clave
 * y filtra por la cuenta de la clave. `tools/list` solo muestra las que la
 * clave puede usar, así el modelo no ve acciones que le van a fallar.
 *
 * El paquete `mcp-server/` (stdio) sigue existiendo para quien prefiera
 * correrlo en su máquina; este endpoint es la forma de no necesitarlo.
 */

import { NextResponse } from 'next/server';

import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { hasScope } from '@/lib/api-keys/scopes';
import { requireApiKey, type ApiKeyContext } from '@/lib/auth/api-context';
import {
  HERRAMIENTAS,
  ejecutarHerramienta,
  herramienta,
} from '@/lib/asistente/herramientas';
import { MARCA } from '@/lib/marca';

export const dynamic = 'force-dynamic';

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05'];

type Id = string | number | null;
interface PeticionRpc {
  jsonrpc: '2.0';
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}

function resultado(id: Id, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function error(id: Id, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function herramientasDe(ctx: ApiKeyContext) {
  return HERRAMIENTAS.filter((h) => hasScope(ctx.scopes, h.alcance));
}

async function atender(
  p: PeticionRpc,
  ctx: ApiKeyContext
): Promise<unknown | null> {
  const id = p.id ?? null;
  // Notificaciones (sin id): no llevan respuesta.
  if (p.id === undefined) return null;

  switch (p.method) {
    case 'initialize': {
      const pedida = String(p.params?.protocolVersion ?? '');
      return resultado(id, {
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'arca', title: MARCA, version: '1.0.0' },
        instructions:
          'CRM ARCA: contactos, negocios (pipelines), tareas y notas. Busca antes de actuar; nunca inventes ids.',
      });
    }
    case 'ping':
      return resultado(id, {});
    case 'tools/list':
      return resultado(id, {
        tools: herramientasDe(ctx).map((h) => ({
          name: h.nombre,
          description: h.descripcion,
          inputSchema: h.parametros,
          annotations: {
            readOnlyHint: !h.escribe,
            destructiveHint: h.confirmar,
            openWorldHint: false,
          },
        })),
      });
    case 'tools/call': {
      const nombre = String(p.params?.name ?? '');
      const h = herramienta(nombre);
      if (!h) return error(id, -32602, `Herramienta desconocida: ${nombre}`);
      if (!hasScope(ctx.scopes, h.alcance)) {
        return resultado(id, {
          content: [
            {
              type: 'text',
              text: `La clave de API no tiene el permiso '${h.alcance}'.`,
            },
          ],
          isError: true,
        });
      }
      const userId =
        ctx.createdBy ??
        (await resolveAuditUserId(ctx.supabase, ctx.accountId));
      const r = await ejecutarHerramienta(
        { db: ctx.supabase, accountId: ctx.accountId, userId },
        nombre,
        (p.params?.arguments as Record<string, unknown>) ?? {}
      );
      return resultado(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(r.ok ? r.resultado : { error: r.error }),
          },
        ],
        isError: !r.ok,
      });
    }
    default:
      return error(id, -32601, `Método no soportado: ${p.method}`);
  }
}

export async function POST(request: Request) {
  let ctx: ApiKeyContext;
  try {
    ctx = await requireApiKey(request);
  } catch {
    return NextResponse.json(
      error(null, -32001, 'Clave de API inválida o ausente'),
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      }
    );
  }

  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo)
    return NextResponse.json(error(null, -32700, 'JSON inválido'), {
      status: 400,
    });

  const lote = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  const respuestas = (
    await Promise.all(lote.map((p) => atender(p as PeticionRpc, ctx)))
  ).filter((r) => r !== null);

  // Solo notificaciones: 202 sin cuerpo, como pide el transporte.
  if (respuestas.length === 0) return new Response(null, { status: 202 });
  return NextResponse.json(Array.isArray(cuerpo) ? respuestas : respuestas[0]);
}

// Sin sesiones ni flujo SSE del servidor: modo sin estado.
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
