'use client';

/**
 * Vistas guardadas: una combinación de filtros con nombre, por módulo.
 *
 * La forma del objeto `filters` la define cada pantalla, no este hook ni la
 * base: en contactos son etiquetas, en empresas el sector, en tareas el
 * vencimiento. Acá viaja como un objeto opaco.
 */

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export type ModuloDeVista =
  | 'contacts'
  | 'companies'
  | 'deals'
  | 'tasks'
  | 'conversations';

export interface SavedView {
  id: string;
  account_id: string;
  user_id: string;
  name: string;
  resource: ModuloDeVista;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
  is_shared: boolean;
  is_default: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useSavedViews(modulo: ModuloDeVista) {
  const { accountId, user } = useAuth();
  const [vistas, setVistas] = useState<SavedView[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    // No hace falta filtrar por "compartida o mía": esa condición ya está en
    // la política de SELECT de la migración 048. Repetirla acá sería una
    // segunda copia de la regla, y la copia es la que se olvida de
    // actualizar.
    const { data, error: err } = await createClient()
      .from('saved_views')
      .select('*')
      .eq('account_id', accountId)
      .eq('resource', modulo)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      setCargando(false);
      return;
    }
    setVistas((data ?? []) as SavedView[]);
    setCargando(false);
  }, [accountId, modulo]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const guardar = useCallback(
    async (
      nombre: string,
      filtros: Record<string, unknown>,
      compartida = true,
    ): Promise<SavedView | null> => {
      if (!accountId || !user) return null;
      const { data, error: err } = await createClient()
        .from('saved_views')
        .insert({
          account_id: accountId,
          user_id: user.id,
          name: nombre.trim(),
          resource: modulo,
          filters: filtros,
          is_shared: compartida,
          position: vistas.length,
        })
        .select('*')
        .single();

      if (err || !data) {
        setError(err?.message ?? 'No se pudo guardar la vista');
        return null;
      }
      const nueva = data as SavedView;
      setVistas((p) => [...p, nueva]);
      return nueva;
    },
    [accountId, user, modulo, vistas.length],
  );

  const renombrar = useCallback(async (id: string, nombre: string) => {
    const { error: err } = await createClient()
      .from('saved_views')
      .update({ name: nombre.trim() })
      .eq('id', id);
    if (err) {
      setError(err.message);
      return false;
    }
    setVistas((p) => p.map((v) => (v.id === id ? { ...v, name: nombre.trim() } : v)));
    return true;
  }, []);

  const borrar = useCallback(async (id: string) => {
    const { error: err } = await createClient().from('saved_views').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return false;
    }
    setVistas((p) => p.filter((v) => v.id !== id));
    return true;
  }, []);

  /**
   * Marca una vista como la que se abre sola, y desmarca la anterior.
   *
   * Se desmarca ANTES de marcar: hay un índice único que impide dos por
   * defecto, así que hacerlo al revés lo violaría y la operación fallaría
   * entera.
   */
  const marcarPorDefecto = useCallback(
    async (id: string | null) => {
      if (!accountId || !user) return;
      const supabase = createClient();
      await supabase
        .from('saved_views')
        .update({ is_default: false })
        .eq('account_id', accountId)
        .eq('resource', modulo)
        .eq('user_id', user.id)
        .eq('is_default', true);

      if (id) {
        await supabase.from('saved_views').update({ is_default: true }).eq('id', id);
      }
      setVistas((p) => p.map((v) => ({ ...v, is_default: v.id === id })));
    },
    [accountId, user, modulo],
  );

  return { vistas, cargando, error, recargar, guardar, renombrar, borrar, marcarPorDefecto };
}
