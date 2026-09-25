/**
 * Leer un sitio por su clave pública. Solo servidor (clave de servicio): quien
 * pregunta es el navegador de un desconocido, sin sesión.
 *
 * Caché en memoria de un minuto. ARCA corre en un solo contenedor, así que una
 * caché por proceso es suficiente; con varias réplicas, pausar tardaría hasta
 * un minuto más en llegar a cada una, que sigue dentro de lo que se promete.
 */

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { moduloActivo } from '@/lib/modulos/servidor';
import { esClaveDeSitio, type ConfigSeguimiento } from './constantes';

export interface Sitio {
  id: string;
  accountId: string;
  paisPorDefecto: string;
  etiquetaId: string | null;
  config: ConfigSeguimiento;
}

const TTL_MS = 60_000;
const cache = new Map<string, { sitio: Sitio | null; vence: number }>();

export async function sitioPorClave(clave: string): Promise<Sitio | null> {
  if (!esClaveDeSitio(clave)) return null;
  // Módulo apagado: el script responde vacío y el colector descarta.
  if (!(await moduloActivo('formularios_web'))) return null;

  const ahora = Date.now();
  const guardado = cache.get(clave);
  if (guardado && guardado.vence > ahora) return guardado.sitio;

  const { data, error } = await supabaseAdmin()
    .from('sitios_web')
    .select(
      'id, account_id, clave, dominios, incluir_subdominios, limitar_a_dominios, respetar_dnt, dias_cookie, pais_por_defecto, etiqueta_id, pausado'
    )
    .eq('clave', clave)
    .maybeSingle();

  if (error) {
    // Un fallo de la base no se cachea: el siguiente intento vuelve a probar.
    console.error('[seguimiento-web] no se pudo leer el sitio:', error.message);
    return null;
  }

  const sitio: Sitio | null =
    data && !data.pausado
      ? {
          id: data.id,
          accountId: data.account_id,
          paisPorDefecto: data.pais_por_defecto,
          etiquetaId: data.etiqueta_id,
          config: {
            clave: data.clave,
            dominios: data.dominios ?? [],
            incluirSubdominios: data.incluir_subdominios,
            limitarADominios: data.limitar_a_dominios,
            respetarDnt: data.respetar_dnt,
            diasCookie: data.dias_cookie,
          },
        }
      : null;

  cache.set(clave, { sitio, vence: ahora + TTL_MS });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (v.vence <= ahora) cache.delete(k);
  }

  return sitio;
}
