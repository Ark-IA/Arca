/**
 * ¿De dónde vino esta visita? Convierte los UTM y el referente en un origen:
 * fuente ("Google", "Facebook", "newsletter"…) y medio (orgánico, pago…).
 *
 * Pura: sin base ni configuración. Adaptado de trycompai/crm (MIT, ver
 * licenses/trycompai-crm.txt).
 *
 * - Un `utm_source` explícito le gana al referente: lo dijo quien armó la campaña.
 * - El host del referente se compara por etiquetas DNS, nunca por subcadena:
 *   `google.evil.com` y `notgoogle.com` son referidos, no Google. Si no, un
 *   estafador aparece como "Google" en el informe del comercial.
 * - El correo web se mira antes que los buscadores: `mail.google.com` contiene
 *   `google.`, y leer el boletín propio como "Google orgánico" es mentir.
 * - "Directo" es una fuente, no un vacío.
 */

export const MEDIOS = [
  'organic',
  'social',
  'referral',
  'email',
  'cpc',
  'direct',
  'other',
] as const;

export type Medio = (typeof MEDIOS)[number];

export interface OrigenCrudo {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrer?: string;
  landing?: string;
  at?: number;
}

export interface Origen {
  fuente: string;
  medio: Medio;
  campana: string | null;
  termino: string | null;
  contenido: string | null;
  referente: string | null;
  aterrizaje: string | null;
  en: string;
}

const BUSCADORES: Record<string, string> = {
  'google.': 'Google',
  'bing.': 'Bing',
  'duckduckgo.': 'DuckDuckGo',
  'yahoo.': 'Yahoo',
  'ecosia.': 'Ecosia',
  'search.brave.': 'Brave Search',
  'yandex.': 'Yandex',
  'baidu.': 'Baidu',
};

const REDES: Record<string, string> = {
  'facebook.': 'Facebook',
  'fb.com': 'Facebook',
  'm.facebook.': 'Facebook',
  'l.facebook.': 'Facebook',
  'lm.facebook.': 'Facebook',
  'instagram.': 'Instagram',
  'l.instagram.': 'Instagram',
  'wa.me': 'WhatsApp',
  'whatsapp.': 'WhatsApp',
  'linkedin.': 'LinkedIn',
  'lnkd.in': 'LinkedIn',
  'twitter.': 'X',
  'x.com': 'X',
  't.co': 'X',
  'youtube.': 'YouTube',
  'youtu.be': 'YouTube',
  'tiktok.': 'TikTok',
  'reddit.': 'Reddit',
  'pinterest.': 'Pinterest',
  'threads.': 'Threads',
};

const CORREO: Record<string, string> = {
  'mail.google.': 'Gmail',
  'outlook.': 'Outlook',
  'mail.yahoo.': 'Yahoo Mail',
};

/** Segundo nivel que solo cuenta seguido de un código de país: `com.co`, `co.uk`. */
const SEGUNDO_NIVEL = new Set([
  'co',
  'com',
  'net',
  'org',
  'gov',
  'gob',
  'edu',
  'ac',
  'or',
  'ne',
]);

const MEDIOS_PAGOS = new Set([
  'cpc',
  'ppc',
  'paid',
  'paidsearch',
  'paid_search',
  'paid_social',
  'paidsocial',
  'ads',
]);

const MAX = 120;

export function clasificarOrigen(
  crudo: OrigenCrudo,
  ahora: Date = new Date()
): Origen {
  const cuando = crudo.at ? new Date(crudo.at) : ahora;
  const en = (valida(cuando) ? cuando : ahora).toISOString();
  const campana = limpiar(crudo.campaign);
  const termino = limpiar(crudo.term);
  const contenido = limpiar(crudo.content);
  const referente = limpiar(crudo.referrer);
  const aterrizaje = limpiar(crudo.landing);

  const fuenteUtm = limpiar(crudo.source);
  const medioUtm = limpiar(crudo.medium)?.toLowerCase();

  if (fuenteUtm) {
    return {
      fuente: fuenteUtm,
      medio: medioDe(medioUtm),
      campana,
      termino,
      contenido,
      referente,
      aterrizaje,
      en,
    };
  }

  const host = hostDe(referente);

  if (!host) {
    return {
      fuente: 'Directo',
      medio: medioUtm ? medioDe(medioUtm) : 'direct',
      campana,
      termino,
      contenido,
      referente: null,
      aterrizaje,
      en,
    };
  }

  const correo = buscar(host, CORREO);
  const buscador = correo ? null : buscar(host, BUSCADORES);
  const red = correo || buscador ? null : buscar(host, REDES);

  const medio: Medio = correo
    ? 'email'
    : buscador
      ? 'organic'
      : red
        ? 'social'
        : 'referral';

  return {
    fuente: correo ?? buscador ?? red ?? host,
    medio: medioUtm ? medioDe(medioUtm) : medio,
    campana,
    termino,
    contenido,
    referente,
    aterrizaje,
    en,
  };
}

const NOMBRE_MEDIO: Record<Medio, string> = {
  organic: 'orgánico',
  social: 'redes',
  referral: 'referido',
  email: 'correo',
  cpc: 'pago',
  direct: 'directo',
  other: 'otro',
};

/** "Facebook · pago · promo-septiembre", para mostrar en la ficha. */
export function describirOrigen(
  origen: Pick<Origen, 'fuente' | 'medio' | 'campana'> | null | undefined
): string {
  if (!origen?.fuente) return 'Desconocido';
  const medio =
    origen.medio && origen.medio !== 'direct'
      ? (NOMBRE_MEDIO[origen.medio] ?? origen.medio)
      : null;
  return [origen.fuente, medio, origen.campana].filter(Boolean).join(' · ');
}

function medioDe(valor: string | null | undefined): Medio {
  if (!valor) return 'other';
  if (MEDIOS_PAGOS.has(valor)) return 'cpc';
  if ((MEDIOS as readonly string[]).includes(valor)) return valor as Medio;
  if (valor.includes('mail')) return 'email';
  if (valor.includes('social')) return 'social';
  if (valor.includes('organic')) return 'organic';
  return 'other';
}

function buscar(host: string, tabla: Record<string, string>): string | null {
  const etiquetas = host.split('.');
  for (const [aguja, nombre] of Object.entries(tabla)) {
    if (coincide(etiquetas, aguja)) return nombre;
  }
  return null;
}

function coincide(etiquetas: string[], aguja: string): boolean {
  const abierta = aguja.endsWith('.');
  const buscadas = (abierta ? aguja.slice(0, -1) : aguja).split('.');

  for (
    let inicio = 0;
    inicio + buscadas.length <= etiquetas.length;
    inicio += 1
  ) {
    if (buscadas.some((e, i) => etiquetas[inicio + i] !== e)) continue;
    const cola = etiquetas.slice(inicio + buscadas.length);
    if (abierta ? esSufijo(cola) : cola.length === 0) return true;
  }
  return false;
}

function esSufijo(cola: string[]): boolean {
  if (cola.length === 1) return true;
  if (cola.length !== 2) return false;
  return SEGUNDO_NIVEL.has(cola[0] ?? '') && /^[a-z]{2}$/.test(cola[1] ?? '');
}

function hostDe(referente: string | null): string | null {
  if (!referente) return null;
  try {
    return new URL(referente).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function limpiar(valor: string | null | undefined): string | null {
  const t = typeof valor === 'string' ? valor.trim() : '';
  if (!t) return null;
  return t.length > MAX ? t.slice(0, MAX) : t;
}

function valida(fecha: Date): boolean {
  return !Number.isNaN(fecha.getTime());
}
