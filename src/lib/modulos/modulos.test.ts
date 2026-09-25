import { afterEach, describe, expect, it } from 'vitest';

import {
  MODULOS,
  INFO_MODULOS,
  moduloDeAjuste,
  modulosDeRuta,
  rutaDisponible,
} from './catalogo';
import { esSuperadmin } from './superadmin';
import { SETTINGS_SECTIONS } from '@/components/settings/settings-sections';

describe('catálogo de módulos', () => {
  it('ubica páginas y API en su módulo', () => {
    expect(modulosDeRuta('/pipelines')).toEqual(['pipelines']);
    expect(modulosDeRuta('/automations/123/edit')).toEqual([
      'automatizaciones',
    ]);
    expect(modulosDeRuta('/api/telefonia/credenciales')).toEqual(['telefonia']);
  });

  it('una ruta de la API pública depende de su módulo Y de la API', () => {
    expect(modulosDeRuta('/api/v1/deals/1').sort()).toEqual([
      'api',
      'pipelines',
    ]);
    expect(rutaDisponible('/api/v1/deals', new Set(['api']))).toBe(false);
    expect(rutaDisponible('/api/v1/deals', new Set(['pipelines']))).toBe(false);
    expect(rutaDisponible('/api/v1/contacts', new Set(['pipelines']))).toBe(
      true
    );
  });

  it('el núcleo no se puede apagar', () => {
    const todo = new Set<string>(MODULOS);
    for (const r of [
      '/dashboard',
      '/inbox',
      '/contacts',
      '/settings',
      '/api/whatsapp/send',
      '/superadmin',
      '/api/modulos',
    ]) {
      expect(rutaDisponible(r, todo)).toBe(true);
    }
  });

  it('no confunde prefijos parecidos', () => {
    expect(modulosDeRuta('/tasksx')).toEqual([]);
    expect(modulosDeRuta('/api/aiuda')).toEqual([]);
  });

  it('los webhooks no dependen de ningún módulo', () => {
    expect(modulosDeRuta('/api/meta/webhook')).toEqual([]);
    expect(modulosDeRuta('/api/whatsapp/webhook')).toEqual([]);
  });

  it('cada sección de ajustes nombrada existe', () => {
    for (const m of MODULOS) {
      for (const a of INFO_MODULOS[m].ajustes) {
        expect(SETTINGS_SECTIONS as readonly string[]).toContain(a);
      }
    }
    expect(moduloDeAjuste('colas')).toBe('colas');
    expect(moduloDeAjuste('profile')).toBeNull();
  });
});

describe('superadmin', () => {
  const antes = process.env.ARCA_SUPERADMINS;
  afterEach(() => {
    process.env.ARCA_SUPERADMINS = antes;
  });

  it('solo los correos de la variable, sin importar mayúsculas', () => {
    process.env.ARCA_SUPERADMINS = ' soporte@ark-ia.com , Otro@Ark-IA.com';
    expect(esSuperadmin('SOPORTE@ark-ia.com')).toBe(true);
    expect(esSuperadmin('otro@ark-ia.com')).toBe(true);
    expect(esSuperadmin('cliente@empresa.com')).toBe(false);
    expect(esSuperadmin(null)).toBe(false);
  });

  it('sin variable no hay superadmin', () => {
    delete process.env.ARCA_SUPERADMINS;
    expect(esSuperadmin('soporte@ark-ia.com')).toBe(false);
    expect(esSuperadmin('')).toBe(false);
  });
});
