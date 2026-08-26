'use client';

/**
 * Agenda.
 *
 * Carga por rango de fechas y no todo de una: una cuenta con dos años de
 * reuniones traería miles de filas para pintar un mes.
 */

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { CalendarEvent, EstadoEvento } from '@/types';

export interface BorradorEvento {
  title: string;
  description?: string | null;
  location?: string | null;
  meeting_url?: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day?: boolean;
  status?: EstadoEvento;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
}

export function useCalendar(desde: Date, hasta: Date) {
  const { accountId, user } = useAuth();
  const [eventos, setEventos] = useState<CalendarEvent[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Las fechas se pasan como texto: dos objetos `Date` con el mismo instante
  // son distintos por identidad, así que usarlos de dependencia recargaría en
  // cada renderizado.
  const desdeIso = desde.toISOString();
  const hastaIso = hasta.toISOString();

  const recargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    setError(null);
    const { data, error: err } = await createClient()
      .from('calendar_events')
      .select('*')
      .eq('account_id', accountId)
      // Una reunión que empezó antes del rango pero termina dentro también
      // cae en el mes que se está mirando.
      .lte('starts_at', hastaIso)
      .gte('ends_at', desdeIso)
      .order('starts_at', { ascending: true });

    if (err) {
      setError(err.message);
      setCargando(false);
      return;
    }
    setEventos((data ?? []) as CalendarEvent[]);
    setCargando(false);
  }, [accountId, desdeIso, hastaIso]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback(
    async (datos: BorradorEvento): Promise<CalendarEvent | null> => {
      if (!accountId || !user) return null;
      const { data, error: err } = await createClient()
        .from('calendar_events')
        .insert({ ...datos, account_id: accountId, user_id: user.id })
        .select('*')
        .single();
      if (err || !data) {
        // 23514 es la restricción que impide que termine antes de empezar.
        setError(
          err?.code === '23514'
            ? 'La hora de fin no puede ser anterior a la de inicio.'
            : (err?.message ?? 'No se pudo crear el evento'),
        );
        return null;
      }
      await recargar();
      return data as CalendarEvent;
    },
    [accountId, user, recargar],
  );

  const actualizar = useCallback(
    async (id: string, cambios: Partial<BorradorEvento>): Promise<boolean> => {
      const { error: err } = await createClient()
        .from('calendar_events')
        .update(cambios)
        .eq('id', id);
      if (err) {
        setError(err.message);
        return false;
      }
      setEventos((prev) => prev.map((e) => (e.id === id ? { ...e, ...cambios } : e)));
      return true;
    },
    [],
  );

  const borrar = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await createClient().from('calendar_events').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return false;
    }
    setEventos((prev) => prev.filter((e) => e.id !== id));
    return true;
  }, []);

  return { eventos, cargando, error, recargar, crear, actualizar, borrar };
}
