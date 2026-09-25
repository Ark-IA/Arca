import { describe, expect, it } from 'vitest';

import { aCsv, duracion, limitesDe, porcentaje } from './tipos';

describe('informes', () => {
  it('los rangos cubren días completos y el final es exclusivo', () => {
    const ahora = new Date(2026, 8, 24, 15, 30);
    const s = limitesDe('7d', ahora);
    expect(s.desde).toEqual(new Date(2026, 8, 18));
    expect(s.hasta).toEqual(new Date(2026, 8, 25));
    const m = limitesDe('mes_anterior', ahora);
    expect(m.desde).toEqual(new Date(2026, 7, 1));
    expect(m.hasta).toEqual(new Date(2026, 8, 1));
    const enero = limitesDe('mes_anterior', new Date(2026, 0, 10));
    expect(enero.desde).toEqual(new Date(2025, 11, 1));
  });

  it('duraciones legibles', () => {
    expect(duracion(null)).toBe('—');
    expect(duracion(0.5)).toBe('30 s');
    expect(duracion(20)).toBe('20 min');
    expect(duracion(85)).toBe('1 h 25 min');
    expect(duracion(60 * 26)).toBe('1 d 2 h');
  });

  it('porcentaje sin dividir por cero', () => {
    expect(porcentaje(1, 4)).toBe('25 %');
    expect(porcentaje(1, 0)).toBe('—');
  });

  it('CSV para Excel en español: punto y coma, comillas y BOM', () => {
    const csv = aCsv(
      ['Nombre', 'Valor'],
      [
        ['Pérez; Ana', 3],
        ['Dice "hola"', null],
      ]
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Pérez; Ana";3');
    expect(csv).toContain('"Dice ""hola""";');
  });
});
