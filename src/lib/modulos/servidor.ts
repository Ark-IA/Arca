/**
 * Leer qué módulos están apagados, desde el servidor.
 *
 * Se consulta en cada petición del middleware y en cada mensaje que entra
 * por los webhooks, así que va con caché en memoria de 30 segundos. Apagar un
 * módulo tarda como mucho eso en surtir efecto; el panel del superadmin
 * limpia la caché de su propio proceso al guardar.
 *
 * Ante un fallo de la base se responde "nada apagado" y NO se cachea: un
 * corte de la base no puede dejar a un cliente sin bandeja, y los módulos
 * apagados vuelven a aplicarse en el siguiente intento.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import type { Modulo } from './catalogo';

const TTL_MS = 30_000;
let cache: { apagados: Set<string>; vence: number } | null = null;

export async function modulosApagados(
  db?: SupabaseClient
): Promise<Set<string>> {
  const ahora = Date.now();
  if (cache && cache.vence > ahora) return cache.apagados;

  try {
    const { data, error } = await (db ?? supabaseAdmin())
      .from('modulos_instalacion')
      .select('clave')
      .eq('activo', false);
    if (error) {
      console.error('[modulos] no se pudieron leer:', error.message);
      return new Set();
    }
    const apagados = new Set((data ?? []).map((f) => f.clave as string));
    cache = { apagados, vence: ahora + TTL_MS };
    return apagados;
  } catch (e) {
    console.error('[modulos] error leyendo:', e);
    return new Set();
  }
}

export async function moduloActivo(
  modulo: Modulo,
  db?: SupabaseClient
): Promise<boolean> {
  return !(await modulosApagados(db)).has(modulo);
}

export function olvidarModulos(): void {
  cache = null;
}
