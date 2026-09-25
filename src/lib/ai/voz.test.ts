import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flows/meta-send', () => ({ engineSendMedia: vi.fn() }));

import { engineSendMedia } from '@/lib/flows/meta-send';
import { clienteMandoAudio, idDeVoz, modoDeVoz, responderConVoz } from './voz';

function dbQueDevuelve(data: unknown, error: unknown = null) {
  const cadena = {
    select: () => cadena,
    eq: () => cadena,
    order: () => cadena,
    limit: () => cadena,
    maybeSingle: async () => ({ data, error }),
  };
  return { from: () => cadena } as never;
}

afterEach(() => {
  delete process.env.ARCA_TTS_URL;
  vi.restoreAllMocks();
});

describe('modoDeVoz', () => {
  it('lee el modo guardado', async () => {
    expect(await modoDeVoz(dbQueDevuelve({ voz_modo: 'si_audio' }), 'c')).toBe('si_audio');
  });

  it('sin la columna (migración pendiente) o sin fila responde "nunca"', async () => {
    expect(await modoDeVoz(dbQueDevuelve(null, { message: 'column does not exist' }), 'c')).toBe('nunca');
    expect(await modoDeVoz(dbQueDevuelve(null), 'c')).toBe('nunca');
    expect(await modoDeVoz(dbQueDevuelve({ voz_modo: 'raro' }), 'c')).toBe('nunca');
  });
});

describe('clienteMandoAudio', () => {
  it('mira el tipo del último mensaje del cliente', async () => {
    expect(await clienteMandoAudio(dbQueDevuelve({ content_type: 'audio' }), 'x')).toBe(true);
    expect(await clienteMandoAudio(dbQueDevuelve({ content_type: 'text' }), 'x')).toBe(false);
  });
});

describe('responderConVoz', () => {
  const base = {
    db: {} as never,
    accountId: 'a',
    configOwnerUserId: 'u',
    conversationId: 'c',
    contactId: 'k',
    texto: 'hola',
  };

  it('fuera de WhatsApp o sin servicio devuelve false y no envía nada', async () => {
    process.env.ARCA_TTS_URL = 'http://voz:8000';
    expect(await responderConVoz({ ...base, canal: 'instagram' })).toBe(false);
    delete process.env.ARCA_TTS_URL;
    expect(await responderConVoz({ ...base, canal: 'whatsapp' })).toBe(false);
    expect(engineSendMedia).not.toHaveBeenCalled();
  });

  it('si el servicio falla devuelve false para que salga el texto', async () => {
    process.env.ARCA_TTS_URL = 'http://voz:8000';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('caído', { status: 503 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await responderConVoz({ ...base, canal: 'whatsapp' })).toBe(false);
    expect(engineSendMedia).not.toHaveBeenCalled();
  });

  it('el id de voz cumple el formato que acepta el servicio', () => {
    expect(idDeVoz('0b6f2a3e-1111-4c4c-9999-abcdefabcdef')).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });
});
