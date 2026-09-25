/**
 * El colector: lo que hace `POST /api/t/e` con un lote.
 *
 * Filtros, en orden, y cualquiera que falle descarta en silencio (el script
 * no lee la respuesta; uno que pudiera leerla sería uno cuyos fallos un
 * extraño podría sondear):
 *
 * 1. Agente de usuario: bots fuera.
 * 2. Clave del sitio: tiene que existir y no estar pausado.
 * 3. Origin: sin él se rechaza siempre; con lista de dominios, tiene que estar.
 * 4. Visitante: 8–64 de `[a-zA-Z0-9_-]`.
 * 5. Repetición: tres o más eventos con la MISMA marca de tiempo son un script.
 * 6. Host de cada evento: se filtran los de fuera, no se rechaza el lote.
 * 7. Ritmo: EVENTOS_POR_MINUTO por sitio, cobrado por evento.
 *
 * Nunca se guarda una IP ni una query string.
 *
 * Adaptado de trycompai/crm (MIT, ver licenses/trycompai-crm.txt).
 */

import { createHash } from 'node:crypto';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { archivarEnvio } from './archivar';
import { clasificarOrigen, type OrigenCrudo } from './atribucion';
import {
  correoDe,
  empresaDe,
  limpiarCampos,
  nombreDe,
  telefonoDe,
} from './campos';
import {
  DIAS_RETENCION_EVENTOS,
  EVENTOS_POR_MINUTO,
  MAX_EVENTOS_POR_LOTE,
  hostPermitido,
  normalizarRuta,
  origenPermitido,
  sinQuery,
} from './constantes';
import { sitioPorClave, type Sitio } from './sitios';

const BOT =
  /bot|crawler|spider|crawling|headlesschrome|lighthouse|preview|facebookexternalhit/i;
const TIPOS = new Set(['page_view', 'click', 'form_submit']);
const MAX_RUTA = 512;
const MAX_HOST = 253;
const MAX_ETIQUETA = 80;

/** Cada cuántos lotes se aprovecha para purgar eventos viejos. */
const PURGAR_CADA = 2_000;
let lotesDesdePurga = 0;

export interface EventoEntrante {
  type?: unknown;
  host?: unknown;
  path?: unknown;
  referrer?: unknown;
  label?: unknown;
  at?: unknown;
  fields?: unknown;
  touch?: unknown;
  firstTouch?: unknown;
}

export interface LoteEntrante {
  siteId?: unknown;
  visitorId?: unknown;
  events?: unknown;
}

interface Aceptado {
  evento: EventoEntrante;
  tipo: string;
  host: string;
}

export async function recibirLote(
  lote: LoteEntrante,
  peticion: { origin: string | null; userAgent: string | null }
): Promise<void> {
  if (peticion.userAgent && BOT.test(peticion.userAgent)) return;
  if (typeof lote.siteId !== 'string') return;

  const sitio = await sitioPorClave(lote.siteId);
  if (!sitio) return;

  if (!origenPermitido(peticion.origin, sitio.config)) return;

  const visitante =
    typeof lote.visitorId === 'string' ? lote.visitorId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(visitante)) return;

  const eventos = Array.isArray(lote.events)
    ? (lote.events.slice(0, MAX_EVENTOS_POR_LOTE) as EventoEntrante[])
    : [];
  if (repetido(eventos)) return;

  const aceptados = eventos.flatMap<Aceptado>((evento) => {
    if (!evento || typeof evento !== 'object') return [];
    const tipo = typeof evento.type === 'string' ? evento.type : '';
    if (!TIPOS.has(tipo)) return [];
    const host =
      typeof evento.host === 'string'
        ? evento.host.toLowerCase().trim().slice(0, MAX_HOST)
        : '';
    return host && hostPermitido(host, sitio.config)
      ? [{ evento, tipo, host }]
      : [];
  });

  if (aceptados.length === 0) return;
  if (!dentroDelRitmo(sitio.id, aceptados.length)) return;

  const db = supabaseAdmin();

  const vistas = aceptados.filter((a) => a.tipo !== 'form_submit');
  if (vistas.length > 0) await guardarEventos(sitio, visitante, vistas);

  for (const formulario of aceptados.filter((a) => a.tipo === 'form_submit')) {
    await guardarFormulario(sitio, visitante, formulario);
  }

  lotesDesdePurga += 1;
  if (lotesDesdePurga >= PURGAR_CADA) {
    lotesDesdePurga = 0;
    const { error } = await db.rpc('purgar_eventos_web', {
      p_dias: DIAS_RETENCION_EVENTOS,
    });
    if (error) console.error('[seguimiento-web] purga:', error.message);
  }
}

async function guardarEventos(
  sitio: Sitio,
  visitante: string,
  aceptados: Aceptado[]
): Promise<void> {
  const db = supabaseAdmin();

  let origenDeLlegada: ReturnType<typeof clasificarOrigen> | null = null;

  const filas = aceptados.map(({ evento, tipo, host }) => {
    const origen =
      tipo === 'page_view' && esObjeto(evento.touch)
        ? clasificarOrigen(llegando(evento.touch as OrigenCrudo))
        : null;
    if (origen && !origenDeLlegada) origenDeLlegada = origen;
    const referente = sinQuery(texto(evento.referrer));

    return {
      account_id: sitio.accountId,
      sitio_id: sitio.id,
      visitante,
      tipo,
      host,
      ruta: normalizarRuta(texto(evento.path)).slice(0, MAX_RUTA),
      referente: referente ? referente.slice(0, MAX_RUTA) : null,
      etiqueta: texto(evento.label)?.slice(0, MAX_ETIQUETA) ?? null,
      fuente: origen?.fuente ?? null,
      medio: origen?.medio ?? null,
      campana: origen?.campana ?? null,
      ocurrio_en: ocurrioEn(evento.at).toISOString(),
    };
  });

  const { error } = await db.from('eventos_web').insert(filas);
  if (error) {
    console.error('[seguimiento-web] eventos:', error.message);
    return;
  }

  await tocarVisitante(sitio, visitante, origenDeLlegada);

  const vistas = filas.filter((f) => f.tipo === 'page_view').length;
  if (vistas > 0) {
    await db.rpc('sumar_visitas_web', { p_sitio: sitio.id, p_vistas: vistas });
  }
}

/**
 * Crea el visitante la primera vez (con su primer origen) y le actualiza la
 * última visita las demás. El primer origen no se pisa nunca.
 */
async function tocarVisitante(
  sitio: Sitio,
  visitante: string,
  origen: ReturnType<typeof clasificarOrigen> | null
): Promise<void> {
  const db = supabaseAdmin();
  const ahora = new Date().toISOString();

  const { error: errNuevo } = await db.from('visitantes_web').upsert(
    {
      account_id: sitio.accountId,
      sitio_id: sitio.id,
      visitante,
      primer_origen: origen,
      ultimo_origen: origen,
      ultima_visita: ahora,
    },
    { onConflict: 'sitio_id,visitante', ignoreDuplicates: true }
  );
  if (errNuevo) {
    console.error('[seguimiento-web] visitante:', errNuevo.message);
    return;
  }

  const cambios: Record<string, unknown> = { ultima_visita: ahora };
  // Solo una llegada con origen explícito cambia el último origen: navegar
  // entre páginas propias no convierte una visita de Google en "directo".
  if (origen && origen.fuente !== 'Directo') cambios.ultimo_origen = origen;

  await db
    .from('visitantes_web')
    .update(cambios)
    .eq('sitio_id', sitio.id)
    .eq('visitante', visitante);
}

async function guardarFormulario(
  sitio: Sitio,
  visitante: string,
  { evento, host }: Aceptado
): Promise<void> {
  const db = supabaseAdmin();

  const campos = limpiarCampos(evento.fields);
  if (Object.keys(campos).length === 0) return;

  const email = correoDe(campos);
  const telefono = telefonoDe(campos, sitio.paisPorDefecto);
  const nombre = nombreDe(campos);
  const empresa = empresaDe(campos);
  const ruta = normalizarRuta(texto(evento.path)).slice(0, MAX_RUTA);
  const en = ocurrioEn(evento.at);

  const ultimoOrigen = clasificarOrigen(
    llegando(esObjeto(evento.touch) ? (evento.touch as OrigenCrudo) : {}),
    en
  );
  const primerOrigen = esObjeto(evento.firstTouch)
    ? clasificarOrigen(llegando(evento.firstTouch as OrigenCrudo), en)
    : ultimoOrigen;

  const clave = claveUnica({
    sitioId: sitio.id,
    host,
    ruta,
    identidad: telefono ?? email,
    en,
  });

  const { error: errInsert } = await db.from('formularios_web').upsert(
    {
      account_id: sitio.accountId,
      sitio_id: sitio.id,
      visitante,
      host,
      ruta,
      nombre,
      email,
      telefono,
      campos,
      primer_origen: primerOrigen,
      ultimo_origen: ultimoOrigen,
      clave_unica: clave,
    },
    { onConflict: 'clave_unica', ignoreDuplicates: true }
  );
  if (errInsert) {
    console.error('[seguimiento-web] formulario:', errInsert.message);
    return;
  }

  const { data: fila } = await db
    .from('formularios_web')
    .select('id, archivado_en, motivo_omitido')
    .eq('clave_unica', clave)
    .maybeSingle();

  // Un reenvío de algo ya archivado u omitido no se repite. Uno que murió a
  // mitad de camino (sin ninguno de los dos) sí: el reenvío ES el reintento.
  if (!fila || fila.archivado_en || fila.motivo_omitido) return;

  const resultado = await archivarEnvio(db, {
    id: fila.id,
    sitio,
    visitante,
    host,
    ruta,
    nombre,
    email,
    telefono,
    empresa,
    campos,
    primerOrigen,
    ultimoOrigen,
  });

  if (!resultado.archivado) {
    console.log(
      '[seguimiento-web] formulario guardado sin contacto:',
      host,
      resultado.motivo
    );
  }
}

function dentroDelRitmo(sitioId: string, eventos: number): boolean {
  for (let i = 0; i < eventos; i += 1) {
    const r = checkRateLimit(`seguimiento-web:eventos:${sitioId}`, {
      limit: EVENTOS_POR_MINUTO,
      windowMs: 60_000,
    });
    if (!r.success) return false;
  }
  return true;
}

function repetido(eventos: EventoEntrante[]): boolean {
  if (eventos.length < 3) return false;
  const marcas = eventos.flatMap((e) =>
    e && typeof e.at === 'number' && Number.isFinite(e.at) ? [e.at] : []
  );
  if (marcas.length !== eventos.length) return false;
  return new Set(marcas).size === 1;
}

/** Acotado a las últimas 24 h: un reloj adelantado no escribe el futuro. */
function ocurrioEn(at: unknown): Date {
  const ahora = Date.now();
  if (typeof at !== 'number' || !Number.isFinite(at)) return new Date(ahora);
  return new Date(Math.min(Math.max(at, ahora - 86_400_000), ahora));
}

function llegando(o: OrigenCrudo): OrigenCrudo {
  return {
    ...o,
    referrer: sinQuery(texto(o.referrer)) ?? undefined,
    landing: sinQuery(texto(o.landing)) ?? undefined,
  };
}

function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function esObjeto(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function claveUnica(partes: {
  sitioId: string;
  host: string;
  ruta: string;
  identidad: string | null;
  en: Date;
}): string {
  const minuto = Math.floor(partes.en.getTime() / 60_000);
  return createHash('sha256')
    .update(
      `${partes.sitioId}|${partes.host}|${partes.ruta}|${partes.identidad ?? ''}|${minuto}`
    )
    .digest('hex');
}
