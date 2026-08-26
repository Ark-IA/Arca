'use client';

/**
 * Tareas.
 *
 * Sirve a dos pantallas distintas: la lista general (todas las de la cuenta) y
 * el panel dentro de la ficha de un contacto o una empresa (solo las de ese
 * registro). Por eso acepta un filtro de destino en vez de haber dos hooks
 * que se copiarían el uno al otro.
 */

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { EstadoTarea, PrioridadTarea, Task, TipoDeRegistro } from '@/types';

export interface BorradorTarea {
  title: string;
  body?: string | null;
  status?: EstadoTarea;
  priority?: PrioridadTarea;
  due_at?: string | null;
  assignee_id?: string | null;
}

/** A qué registro pertenecen las tareas que interesan. */
export interface FiltroDestino {
  tipo: TipoDeRegistro;
  id: string;
}

/** La columna de `task_targets` que corresponde a cada tipo de registro. */
const COLUMNA_DESTINO: Record<TipoDeRegistro, 'contact_id' | 'company_id' | 'deal_id'> = {
  contact: 'contact_id',
  company: 'company_id',
  deal: 'deal_id',
};

export function useTasks(destino?: FiltroDestino) {
  const { accountId, user } = useAuth();
  const [tareas, setTareas] = useState<Task[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    setError(null);
    const supabase = createClient();

    let consulta = supabase
      .from('tasks')
      .select('*, targets:task_targets(*)')
      .eq('account_id', accountId);

    if (destino) {
      // Filtrar por una tabla embebida requiere el `!inner`: sin él, PostgREST
      // devuelve TODAS las tareas y solo recorta los vínculos embebidos, así
      // que el panel de un contacto mostraría las tareas de toda la cuenta.
      consulta = supabase
        .from('tasks')
        .select('*, targets:task_targets!inner(*)')
        .eq('account_id', accountId)
        .eq(`targets.${COLUMNA_DESTINO[destino.tipo]}`, destino.id);
    }

    // Pendientes primero y por vencimiento. `nullsFirst: false` deja las que
    // no tienen fecha al final: una tarea sin plazo nunca es más urgente que
    // una con plazo.
    const { data, error: err } = await consulta
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setCargando(false);
      return;
    }
    setTareas((data ?? []) as Task[]);
    setCargando(false);
  }, [accountId, destino?.tipo, destino?.id]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback(
    async (datos: BorradorTarea, vincularA?: FiltroDestino): Promise<Task | null> => {
      if (!accountId || !user) return null;
      const supabase = createClient();

      const { data, error: err } = await supabase
        .from('tasks')
        .insert({
          account_id: accountId,
          user_id: user.id,
          title: datos.title.trim(),
          body: datos.body?.trim() || null,
          status: datos.status ?? 'todo',
          priority: datos.priority ?? 'normal',
          due_at: datos.due_at || null,
          // Por defecto la tarea es de quien la crea. Una tarea que nace sin
          // dueño se queda sin hacer.
          assignee_id: datos.assignee_id ?? user.id,
        })
        .select('*')
        .single();

      if (err || !data) {
        setError(err?.message ?? 'No se pudo crear la tarea');
        return null;
      }

      const objetivo = vincularA ?? destino;
      if (objetivo) {
        const { error: errVinculo } = await supabase.from('task_targets').insert({
          task_id: (data as Task).id,
          [COLUMNA_DESTINO[objetivo.tipo]]: objetivo.id,
        });
        if (errVinculo) {
          // La tarea existe pero quedó suelta. Se avisa en vez de callar: si
          // no, desaparecería del panel del contacto sin explicación y
          // reaparecería en la lista general.
          setError(
            'La tarea se creó pero no se pudo vincular al registro. Aparece en la lista general.',
          );
        }
      }

      await recargar();
      return data as Task;
    },
    [accountId, user, destino, recargar],
  );

  const actualizar = useCallback(
    async (id: string, cambios: Partial<BorradorTarea>): Promise<boolean> => {
      const supabase = createClient();
      const { error: err } = await supabase.from('tasks').update(cambios).eq('id', id);
      if (err) {
        setError(err.message);
        return false;
      }
      // `completed_at` lo pone un disparador de la base, así que el estado
      // local no lo puede adivinar: se relee la fila afectada.
      const { data } = await supabase.from('tasks').select('*').eq('id', id).single();
      if (data) {
        setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, ...(data as Task) } : t)));
      }
      return true;
    },
    [],
  );

  const borrar = useCallback(async (id: string): Promise<boolean> => {
    const supabase = createClient();
    const { error: err } = await supabase.from('tasks').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return false;
    }
    setTareas((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  /** Marcar hecha / devolver a pendiente con un clic. */
  const alternarHecha = useCallback(
    async (tarea: Task) => {
      await actualizar(tarea.id, {
        status: tarea.status === 'done' ? 'todo' : 'done',
      });
    },
    [actualizar],
  );

  return { tareas, cargando, error, recargar, crear, actualizar, borrar, alternarHecha };
}
