import { describe, expect, it } from 'vitest';

import { aCsv, traerTodo } from './csv';

describe('aCsv', () => {
  it('empieza con BOM y separa con punto y coma', () => {
    const csv = aCsv(['A', 'B'], [[1, 'x']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿A;B\r\n1;x\r\n');
  });

  it('neutraliza fórmulas en texto pero no en números', () => {
    const csv = aCsv(['A'], [['=HYPERLINK("x")'], [-300], ['-5 unidades']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('\r\n-300\r\n');
    expect(csv).toContain("'-5 unidades");
  });
});

describe('traerTodo', () => {
  it('pagina hasta que una página viene incompleta', async () => {
    const total = 2500;
    const pedidas: [number, number][] = [];
    const r = await traerTodo<number>(async (desde, hasta) => {
      pedidas.push([desde, hasta]);
      const data = Array.from({ length: Math.max(0, Math.min(hasta, total - 1) - desde + 1) }, (_, i) => desde + i);
      return { data, error: null };
    });
    expect(r.filas).toHaveLength(total);
    expect(pedidas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(r.recortado).toBe(false);
  });

  it('devuelve el error sin tirar lo que ya trajo', async () => {
    let vuelta = 0;
    const r = await traerTodo<number>(async () => {
      vuelta += 1;
      if (vuelta === 2) return { data: null, error: { message: 'caída' } as never };
      return { data: Array.from({ length: 1000 }, (_, i) => i), error: null };
    });
    expect(r.error).toBe('caída');
    expect(r.filas).toHaveLength(1000);
  });
});
