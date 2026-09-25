import { beforeEach, describe, expect, it, vi } from 'vitest';

const scopes = { actual: ['contacts:read'] as string[] };

vi.mock('@/lib/auth/api-context', () => ({
  requireApiKey: vi.fn(async (req: Request) => {
    if (!req.headers.get('authorization')) throw new Error('401');
    return {
      authType: 'api_key',
      supabase: {},
      accountId: 'acc',
      keyId: 'k',
      scopes: scopes.actual,
      createdBy: 'u1',
    };
  }),
}));
vi.mock('@/lib/api/v1/contacts', () => ({
  resolveAuditUserId: vi.fn(async () => 'u1'),
}));

import { POST } from './route';

function pedir(cuerpo: unknown, conClave = true) {
  return POST(
    new Request('https://crm.x/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(conClave ? { authorization: 'Bearer arca_x' } : {}),
      },
      body: JSON.stringify(cuerpo),
    })
  );
}

beforeEach(() => {
  scopes.actual = ['contacts:read'];
});

describe('/api/mcp', () => {
  it('sin clave responde 401', async () => {
    const r = await pedir({ jsonrpc: '2.0', id: 1, method: 'ping' }, false);
    expect(r.status).toBe(401);
  });

  it('initialize negocia la versión y anuncia herramientas', async () => {
    const r = await pedir({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    });
    const d = await r.json();
    expect(d.result.protocolVersion).toBe('2025-03-26');
    expect(d.result.capabilities.tools).toBeDefined();
  });

  it('tools/list solo muestra lo que la clave puede usar', async () => {
    const d = await (
      await pedir({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    ).json();
    const nombres = d.result.tools.map((t: { name: string }) => t.name);
    expect(nombres).toContain('buscar_contactos');
    expect(nombres).not.toContain('crear_tarea');
    const buscar = d.result.tools.find(
      (t: { name: string }) => t.name === 'buscar_contactos'
    );
    expect(buscar.annotations.readOnlyHint).toBe(true);
    expect(buscar.inputSchema.type).toBe('object');
  });

  it('tools/call sin el permiso devuelve isError sin ejecutar', async () => {
    const d = await (
      await pedir({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'crear_tarea', arguments: { titulo: 'x' } },
      })
    ).json();
    expect(d.result.isError).toBe(true);
    expect(d.result.content[0].text).toContain('tasks:write');
  });

  it('las notificaciones se aceptan con 202 y sin cuerpo', async () => {
    const r = await pedir({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(r.status).toBe(202);
  });

  it('método desconocido: error JSON-RPC', async () => {
    const d = await (
      await pedir({ jsonrpc: '2.0', id: 9, method: 'resources/list' })
    ).json();
    expect(d.error.code).toBe(-32601);
  });
});
