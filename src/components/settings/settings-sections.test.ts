import { describe, it, expect } from 'vitest';

import {
  SECTION_META,
  SETTINGS_SECTIONS,
  puedeVer,
  type SettingsSection,
} from './settings-sections';
import type { AccountRole } from '@/lib/auth/roles';

function visiblesPara(rol: AccountRole | null): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => puedeVer(SECTION_META[s], rol));
}

describe('puedeVer — qué sección ve cada rol', () => {
  it('un observador solo ve lo suyo', () => {
    // Su perfil, su contraseña, su tema, y el resumen que solo muestra
    // estado. Nada que cambie cómo se comporta la plataforma.
    expect(visiblesPara('viewer')).toEqual([
      'overview',
      'profile',
      'security',
      'appearance',
    ]);
  });

  it('un asesor suma las respuestas rápidas y nada más', () => {
    // Las usa a diario y son texto propio: no tocan credenciales, ni el
    // modelo de datos, ni lo que responde el sistema solo.
    expect(visiblesPara('agent')).toEqual([
      'overview',
      'profile',
      'security',
      'appearance',
      'quick-replies',
    ]);
  });

  it('un administrador ve todo', () => {
    expect(visiblesPara('admin')).toEqual([...SETTINGS_SECTIONS]);
    expect(visiblesPara('owner')).toEqual([...SETTINGS_SECTIONS]);
  });

  it('sin rol resuelto todavía, solo lo que no exige ninguno', () => {
    // Medio segundo durante la carga. Al revés dibujaría secciones que
    // desaparecen solas, que se lee como un fallo.
    expect(visiblesPara(null)).toEqual([
      'overview',
      'profile',
      'security',
      'appearance',
    ]);
  });

  // Lo que de verdad protege esta prueba: que nadie agregue mañana una
  // sección con credenciales y se olvide de marcarla.
  it('ninguna sección del espacio de trabajo queda abierta a todos', () => {
    const abiertas = SETTINGS_SECTIONS.filter(
      (s) => SECTION_META[s].group === 'workspace' && !SECTION_META[s].minRole,
    );
    expect(abiertas).toEqual([]);
  });
});
