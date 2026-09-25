import { describe, expect, it } from 'vitest';

import { clasificarOrigen, describirOrigen } from './atribucion';
import {
  correoDe,
  empresaDe,
  limpiarCampos,
  nombreDe,
  normalizarTelefono,
  telefonoDe,
} from './campos';
import {
  esClaveDeSitio,
  fragmentoGtm,
  hostPermitido,
  normalizarDominio,
  normalizarRuta,
  nuevaClaveDeSitio,
  origenPermitido,
  sinQuery,
  type ConfigSeguimiento,
} from './constantes';
import { claveUnica } from './ingesta';
import { FUENTE_CARGADOR, fuenteRastreador } from './scripts';

const config: ConfigSeguimiento = {
  clave: 'arc_0123456789ab',
  dominios: ['acme.com.co'],
  incluirSubdominios: true,
  limitarADominios: true,
  respetarDnt: true,
  diasCookie: 395,
};

describe('atribución', () => {
  it('un utm_source explícito le gana al referente', () => {
    const o = clasificarOrigen({
      source: 'newsletter',
      medium: 'email',
      campaign: 'sept',
      referrer: 'https://www.google.com/',
    });
    expect(o).toMatchObject({
      fuente: 'newsletter',
      medio: 'email',
      campana: 'sept',
    });
  });

  it('reconoce buscadores y redes por etiquetas DNS, con dominios de país', () => {
    expect(
      clasificarOrigen({ referrer: 'https://www.google.com.co/' })
    ).toMatchObject({
      fuente: 'Google',
      medio: 'organic',
    });
    expect(
      clasificarOrigen({ referrer: 'https://l.facebook.com/l.php' })
    ).toMatchObject({
      fuente: 'Facebook',
      medio: 'social',
    });
  });

  it('no se deja engañar por subcadenas', () => {
    for (const r of [
      'https://notgoogle.com/',
      'https://google.evil.com/',
      'https://google.com.phish.example/',
    ]) {
      expect(clasificarOrigen({ referrer: r }).medio).toBe('referral');
    }
  });

  it('el correo web se mira antes que el buscador', () => {
    expect(
      clasificarOrigen({ referrer: 'https://mail.google.com/' })
    ).toMatchObject({
      fuente: 'Gmail',
      medio: 'email',
    });
  });

  it('sin referente es Directo, y los medios pagos se agrupan', () => {
    expect(clasificarOrigen({}).fuente).toBe('Directo');
    expect(
      clasificarOrigen({ source: 'Facebook', medium: 'paid_social' }).medio
    ).toBe('cpc');
  });

  it('describe en español', () => {
    expect(
      describirOrigen({ fuente: 'Facebook', medio: 'cpc', campana: 'promo' })
    ).toBe('Facebook · pago · promo');
    expect(describirOrigen(null)).toBe('Desconocido');
  });
});

describe('campos del formulario', () => {
  it('nunca guarda contraseñas ni tarjetas', () => {
    const c = limpiarCampos({
      nombre: 'Ana',
      password: 'x',
      clave: 'y',
      numero: '4111 1111 1111 1111',
      celular: '+57 300 123 4567',
      vacio: '  ',
      raro: 42,
    });
    expect(c).toEqual({ nombre: 'Ana', celular: '+57 300 123 4567' });
  });

  it('saca correo, nombre, empresa y teléfono con nombres en español', () => {
    const c = limpiarCampos({
      nombres: 'Ana',
      apellidos: 'Pérez',
      'your-email': 'ANA@Acme.co',
      whatsapp: '300 123 4567',
      empresa: 'Acme',
      documento: '1020304050',
    });
    expect(correoDe(c)).toBe('ana@acme.co');
    expect(nombreDe(c)).toBe('Ana Pérez');
    expect(empresaDe(c)).toBe('Acme');
    expect(telefonoDe(c, '57')).toBe('573001234567');
  });

  it('un número de documento no se toma por teléfono', () => {
    expect(telefonoDe({ documento: '1020304050' }, '57')).toBeNull();
  });

  it('normaliza teléfonos nacionales e internacionales', () => {
    expect(normalizarTelefono('3001234567', '57')).toBe('573001234567');
    expect(normalizarTelefono('+57 300-123-4567', '57')).toBe('573001234567');
    expect(normalizarTelefono('0057 3001234567', '57')).toBe('573001234567');
    expect(normalizarTelefono('573001234567', '57')).toBe('573001234567');
    expect(normalizarTelefono('+1 415 555 0123', '57')).toBe('14155550123');
    expect(normalizarTelefono('1234', '57')).toBeNull();
  });
});

describe('dominios, rutas y claves', () => {
  it('normaliza lo que alguien escribe como dominio', () => {
    expect(normalizarDominio('https://www.Acme.com.co/contacto')).toBe(
      'acme.com.co'
    );
    expect(normalizarDominio('localhost')).toBeNull();
    expect(normalizarDominio('')).toBeNull();
  });

  it('acepta el dominio y sus subdominios, y nada más', () => {
    expect(hostPermitido('acme.com.co', config)).toBe(true);
    expect(hostPermitido('www.acme.com.co', config)).toBe(true);
    expect(hostPermitido('tienda.acme.com.co', config)).toBe(true);
    expect(hostPermitido('notacme.com.co', config)).toBe(false);
    expect(
      hostPermitido('tienda.acme.com.co', {
        ...config,
        incluirSubdominios: false,
      })
    ).toBe(false);
    expect(
      hostPermitido('cualquiera.com', { ...config, limitarADominios: false })
    ).toBe(true);
  });

  it('sin Origin se rechaza siempre', () => {
    expect(origenPermitido(null, { ...config, limitarADominios: false })).toBe(
      false
    );
    expect(origenPermitido('https://acme.com.co', config)).toBe(true);
  });

  it('nunca guarda query strings', () => {
    expect(normalizarRuta('/reset?token=abc#x')).toBe('/reset');
    expect(normalizarRuta('/a/')).toBe('/a');
    expect(normalizarRuta('javascript:alert(1)')).toBe('/');
    expect(sinQuery('https://x.com/p?token=1')).toBe('https://x.com/p');
  });

  it('genera claves con la forma que acepta el cargador', () => {
    const clave = nuevaClaveDeSitio();
    expect(esClaveDeSitio(clave)).toBe(true);
    expect(esClaveDeSitio('arc_xyz')).toBe(false);
    expect(fragmentoGtm('https://crm.x.com/', clave)).toContain(
      `/t/arca.js?site=${clave}`
    );
  });

  it('un reenvío dentro del mismo minuto tiene la misma clave única', () => {
    const base = {
      sitioId: 's',
      host: 'acme.com.co',
      ruta: '/',
      identidad: '573001234567',
    };
    const a = claveUnica({ ...base, en: new Date('2026-09-24T10:00:05Z') });
    const b = claveUnica({ ...base, en: new Date('2026-09-24T10:00:55Z') });
    const c = claveUnica({ ...base, en: new Date('2026-09-24T10:01:05Z') });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('scripts', () => {
  it('son JavaScript válido', () => {
    expect(() => new Function(FUENTE_CARGADOR)).not.toThrow();
    expect(
      () => new Function(fuenteRastreador(config, 'https://crm.x.com/api/t/e'))
    ).not.toThrow();
  });

  it('el rastreador cabe en el presupuesto de tamaño', () => {
    // Corre en cada página del cliente: si crece, que sea a propósito.
    expect(
      fuenteRastreador(config, 'https://crm.x.com/api/t/e').length
    ).toBeLessThan(8_000);
  });
});
