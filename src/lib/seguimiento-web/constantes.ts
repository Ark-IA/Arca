/**
 * Seguimiento web: constantes y funciones puras que comparten el script (que
 * corre en la página del cliente) y el colector (que corre acá).
 *
 * Una constante copiada como literal en un lado y no en el otro es un cliente
 * y un servidor que no se ponen de acuerdo, y el desacuerdo es silencioso: el
 * script manda lotes más grandes de lo que el colector acepta y se pierden
 * enteros. Por eso viven en un solo archivo.
 *
 * Adaptado de trycompai/crm (MIT, ver licenses/trycompai-crm.txt).
 */

export const COOKIE_VISITANTE = '_arca_v';
export const COOKIE_PRIMER_ORIGEN = '_arca_fs';

export const MAX_EVENTOS_POR_LOTE = 20;

/** Un formulario son hasta 40 campos de 512 caracteres: cabe holgado. */
export const MAX_BYTES_CUERPO = 32_768;

/** Eventos aceptados por sitio y minuto. */
export const EVENTOS_POR_MINUTO = 600;

/** Contactos NUEVOS por sitio y hora. Acota el daño de un formulario atacado por un bot. */
export const CONTACTOS_POR_HORA = 50;

export const MOTIVO_TOPE_CONTACTOS =
  'Tope de contactos por hora alcanzado: no se creó';

/** Cuánto vive en caché el script con la configuración. Pausar surte efecto en este plazo. */
export const SEGUNDOS_CACHE_CONFIG = 300;

export const SEGUNDOS_CACHE_CARGADOR = 600;

export const DIAS_RETENCION_EVENTOS = 90;

/** Ventana del enlazador entre dominios propios (`#_arca=<visitante>.<segundos>`). */
export const SEGUNDOS_ENLAZADOR = 120;

export interface ConfigSeguimiento {
  clave: string;
  dominios: string[];
  incluirSubdominios: boolean;
  limitarADominios: boolean;
  respetarDnt: boolean;
  diasCookie: number;
}

const FORMA_CLAVE = /^arc_[0-9a-f]{12}$/;

export function esClaveDeSitio(
  valor: string | null | undefined
): valor is string {
  return FORMA_CLAVE.test(valor ?? '');
}

export function nuevaClaveDeSitio(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `arc_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function urlCargador(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/t/arca.js`;
}

export function fragmentoScript(appUrl: string, clave: string): string {
  return `<script src="${urlCargador(appUrl)}" data-site="${clave}" async defer></script>`;
}

/**
 * Para Google Tag Manager. Su inyector de HTML personalizado reconstruye la
 * etiqueta y conserva solo la URL: `data-site` se pierde en el camino y el
 * script carga sin saber de qué sitio es. En la URL no hay forma de perderlo.
 */
export function fragmentoGtm(appUrl: string, clave: string): string {
  return `<script src="${urlCargador(appUrl)}?site=${clave}" async defer></script>`;
}

/** Normaliza lo que alguien escribe como dominio: "https://www.Acme.com/x" → "acme.com". */
export function normalizarDominio(
  entrada: string | null | undefined
): string | null {
  const recortado = entrada?.trim().toLowerCase();
  if (!recortado) return null;

  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//.test(recortado)
    ? recortado
    : `https://${recortado}`;

  let host: string;
  try {
    host = new URL(conEsquema).hostname;
  } catch {
    return null;
  }

  const limpio = host.replace(/\.$/, '').replace(/^www\./, '');
  if (!limpio.includes('.')) return null;
  if (!/^[a-z0-9.-]+$/.test(limpio)) return null;
  if (limpio.startsWith('.') || limpio.includes('..')) return null;

  return limpio;
}

export function hostPermitido(
  host: string,
  config: ConfigSeguimiento
): boolean {
  if (!config.limitarADominios) return true;

  const h = host.toLowerCase().replace(/^www\./, '');
  return config.dominios.some(
    (d) => h === d || (config.incluirSubdominios && h.endsWith(`.${d}`))
  );
}

/**
 * El encabezado Origin es lo único que ata el POST a un navegador en una
 * página. Sin él se rechaza aunque no haya lista de dominios.
 */
export function origenPermitido(
  origen: string | null | undefined,
  config: ConfigSeguimiento
): boolean {
  if (!origen) return false;

  let host: string;
  try {
    host = new URL(origen).hostname.toLowerCase();
  } catch {
    return false;
  }

  return hostPermitido(host, config);
}

/** Ruta sin query ni fragmento: un enlace de "restablecer contraseña" no se guarda nunca. */
export function normalizarRuta(entrada: string | null | undefined): string {
  const crudo = entrada?.trim();
  if (!crudo) return '/';

  const ruta = crudo.split(/[?#]/)[0] ?? '/';
  if (!ruta.startsWith('/')) return '/';

  const recortada = ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;
  return recortada === '' ? '/' : recortada;
}

export function sinQuery(entrada: string | null | undefined): string | null {
  const crudo = entrada?.trim();
  if (!crudo) return null;

  const corte = crudo.split(/[?#]/)[0] ?? '';
  return corte === '' ? null : corte;
}
