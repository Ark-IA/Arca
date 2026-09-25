import { afterEach, describe, expect, it, vi } from 'vitest';

import { conversar, fraseDeConfirmacion, instrucciones } from './asistente';
import { HERRAMIENTAS } from './herramientas';
import { pasoDelModelo, type Paso } from './modelo';

const config = { provider: 'openai' as const, model: 'm', apiKey: 'k' };

function dbFalsa(filas: unknown[]) {
  const cadena: Record<string, unknown> = {};
  for (const m of [
    'select',
    'eq',
    'or',
    'order',
    'ilike',
    'in',
    'lt',
    'lte',
    'gte',
  ])
    cadena[m] = () => cadena;
  cadena.limit = async () => ({ data: filas, error: null });
  return { from: () => cadena } as never;
}

function guion(pasos: Paso[]) {
  let i = 0;
  return vi.fn(async () => pasos[i++] ?? { texto: 'fin', llamadas: [] });
}

afterEach(() => vi.restoreAllMocks());

describe('conversar', () => {
  it('ejecuta las lecturas y devuelve lo que dice el modelo después', async () => {
    const paso = guion([
      {
        texto: null,
        llamadas: [
          { id: '1', nombre: 'buscar_contactos', args: { consulta: 'Ana' } },
        ],
      },
      { texto: 'Encontré a Ana Pérez.', llamadas: [] },
    ]);
    const r = await conversar({
      ctx: {
        db: dbFalsa([{ id: 'c1', name: 'Ana Pérez' }]),
        accountId: 'a',
        userId: 'u',
      },
      config,
      sistema: 's',
      historial: [],
      orden: 'busca a Ana',
      paso,
    });
    expect(r.texto).toBe('Encontré a Ana Pérez.');
    expect(r.acciones).toEqual([{ nombre: 'buscar_contactos', ok: true }]);
    const resultado = r.historial.find((m) => m.rol === 'herramienta');
    expect(
      resultado && 'resultado' in resultado ? resultado.resultado : ''
    ).toContain('Ana Pérez');
  });

  it('NO ejecuta las acciones que piden confirmación: las deja pendientes', async () => {
    const ejecutar = vi.spyOn(
      HERRAMIENTAS.find((h) => h.nombre === 'mover_negocio')!,
      'ejecutar'
    );
    const paso = guion([
      {
        texto: null,
        llamadas: [
          {
            id: '9',
            nombre: 'mover_negocio',
            args: { negocio_id: 'd1', etapa: 'Propuesta' },
          },
        ],
      },
      { texto: 'Te dejo para confirmar el cambio.', llamadas: [] },
    ]);
    const r = await conversar({
      ctx: { db: dbFalsa([]), accountId: 'a', userId: 'u' },
      config,
      sistema: 's',
      historial: [],
      orden: 'pasa el negocio a propuesta',
      paso,
    });
    expect(ejecutar).not.toHaveBeenCalled();
    expect(r.pendientes).toEqual([
      {
        id: '9',
        nombre: 'mover_negocio',
        args: { negocio_id: 'd1', etapa: 'Propuesta' },
        descripcion: 'Mover el negocio a la etapa «Propuesta»',
      },
    ]);
  });

  it('a un observador solo le ofrece herramientas de lectura', async () => {
    const paso = guion([{ texto: 'ok', llamadas: [] }]);
    await conversar({
      ctx: { db: dbFalsa([]), accountId: 'a', userId: 'u' },
      config,
      sistema: 's',
      historial: [],
      orden: 'hola',
      soloLectura: true,
      paso,
    });
    const ofrecidas = (
      paso.mock.calls[0] as unknown as [
        { herramientas: { escribe: boolean }[] },
      ]
    )[0].herramientas;
    expect(ofrecidas.length).toBeGreaterThan(0);
    expect(ofrecidas.every((h) => !h.escribe)).toBe(true);
  });

  it('una herramienta que no se ofreció se rechaza aunque el modelo la pida', async () => {
    const paso = guion([
      {
        texto: null,
        llamadas: [{ id: '1', nombre: 'crear_tarea', args: { titulo: 'x' } }],
      },
      { texto: 'No puedo.', llamadas: [] },
    ]);
    const r = await conversar({
      ctx: { db: dbFalsa([]), accountId: 'a', userId: 'u' },
      config,
      sistema: 's',
      historial: [],
      orden: 'crea una tarea',
      soloLectura: true,
      paso,
    });
    expect(r.acciones).toEqual([]);
    expect(JSON.stringify(r.historial)).toContain('no está disponible');
  });

  it('corta si el modelo no deja de pedir herramientas', async () => {
    const paso = vi.fn(async () => ({
      texto: null,
      llamadas: [
        { id: 'x', nombre: 'buscar_contactos', args: { consulta: 'a' } },
      ],
    }));
    const r = await conversar({
      ctx: { db: dbFalsa([]), accountId: 'a', userId: 'u' },
      config,
      sistema: 's',
      historial: [],
      orden: 'loop',
      paso,
    });
    expect(paso).toHaveBeenCalledTimes(6);
    expect(r.texto).toContain('otra forma');
  });
});

describe('instrucciones y frases', () => {
  it('lleva la fecha en la zona horaria pedida', () => {
    const s = instrucciones({
      nombre: 'Ana',
      rol: 'agent',
      zona: 'America/Bogota',
      ahora: new Date('2026-09-24T03:00:00Z'),
    });
    expect(s).toContain('Ana');
    expect(s).toContain('23 de septiembre de 2026');
  });

  it('confirma en palabras', () => {
    expect(
      fraseDeConfirmacion('cerrar_negocio', { negocio: 'Web', estado: 'won' })
    ).toContain('ganado');
  });
});

describe('pasoDelModelo', () => {
  const herramientas = HERRAMIENTAS.slice(0, 1);

  it('OpenAI: manda tools y lee tool_calls', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 't1',
                    function: {
                      name: 'buscar_contactos',
                      arguments: '{"consulta":"Ana"}',
                    },
                  },
                ],
              },
            },
          ],
        })
      )
    );
    const r = await pasoDelModelo({
      config,
      sistema: 's',
      mensajes: [
        { rol: 'usuario', texto: 'hola' },
        {
          rol: 'asistente',
          texto: null,
          llamadas: [{ id: 'a', nombre: 'buscar_contactos', args: {} }],
        },
        {
          rol: 'herramienta',
          id: 'a',
          nombre: 'buscar_contactos',
          resultado: '{}',
        },
      ],
      herramientas,
    });
    expect(r.llamadas).toEqual([
      { id: 't1', nombre: 'buscar_contactos', args: { consulta: 'Ana' } },
    ]);
    const cuerpo = JSON.parse(String((f.mock.calls[0][1] as RequestInit).body));
    expect(cuerpo.tools[0].function.name).toBe('buscar_contactos');
    expect(cuerpo.messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ]);
  });

  it('Anthropic: agrupa resultados en un mensaje de usuario y lee tool_use', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            { type: 'text', text: 'Busco.' },
            {
              type: 'tool_use',
              id: 'u1',
              name: 'buscar_contactos',
              input: { consulta: 'Ana' },
            },
          ],
        })
      )
    );
    const r = await pasoDelModelo({
      config: { ...config, provider: 'anthropic' },
      sistema: 's',
      mensajes: [
        { rol: 'usuario', texto: 'hola' },
        {
          rol: 'asistente',
          texto: null,
          llamadas: [
            { id: 'a', nombre: 'buscar_contactos', args: {} },
            { id: 'b', nombre: 'buscar_contactos', args: {} },
          ],
        },
        {
          rol: 'herramienta',
          id: 'a',
          nombre: 'buscar_contactos',
          resultado: '{}',
        },
        {
          rol: 'herramienta',
          id: 'b',
          nombre: 'buscar_contactos',
          resultado: '{}',
        },
      ],
      herramientas,
    });
    expect(r).toEqual({
      texto: 'Busco.',
      llamadas: [
        { id: 'u1', nombre: 'buscar_contactos', args: { consulta: 'Ana' } },
      ],
    });
    const cuerpo = JSON.parse(String((f.mock.calls[0][1] as RequestInit).body));
    expect(cuerpo.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(cuerpo.messages[2].content).toHaveLength(2);
    expect(cuerpo.tools[0].input_schema.type).toBe('object');
  });
});
