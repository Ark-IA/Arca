'use client';

/**
 * Franja con la próxima gestión del contacto, arriba de la pestaña Detalles.
 *
 * Existe porque la pestaña "Próxima gestión" no alcanza: al abrir una ficha
 * la vista cae en Detalles, y lo primero que hay que saber de un contacto no
 * es su correo sino qué sigue con él y cuándo. Esta franja lo dice sin
 * cambiar de pestaña, y si no hay nada agendado ofrece agendarlo.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarPlus, ChevronRight } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Proxima {
  id: string;
  title: string;
  starts_at: string;
}

function cuando(iso: string): { texto: string; vencida: boolean } {
  const d = new Date(iso);
  const dias = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (dias < -1) return { texto: `venció hace ${Math.abs(dias)} días`, vencida: true };
  if (dias === -1) return { texto: `venció ayer a las ${hora}`, vencida: true };
  if (dias === 0) return { texto: `hoy a las ${hora}`, vencida: false };
  if (dias === 1) return { texto: `mañana a las ${hora}`, vencida: false };
  if (dias < 14) return { texto: `en ${dias} días, a las ${hora}`, vencida: false };
  return {
    texto: `${d.toLocaleDateString('es', { day: 'numeric', month: 'long' })} a las ${hora}`,
    vencida: false,
  };
}

export function AvisoProximaGestion({
  contactId,
  /** Lleva a la pestaña donde se agenda. */
  onIr,
}: {
  contactId: string;
  onIr: () => void;
}) {
  const { accountId } = useAuth();
  const [proxima, setProxima] = useState<Proxima | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    // La MÁS PRÓXIMA que siga abierta, incluidas las que ya vencieron: una
    // gestión vencida es exactamente la que hay que ver primero.
    const { data } = await createClient()
      .from('calendar_events')
      .select('id, title, starts_at')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .neq('status', 'canceled')
      .order('starts_at', { ascending: true })
      .limit(1);
    setProxima(((data ?? []) as Proxima[])[0] ?? null);
    setCargando(false);
  }, [accountId, contactId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return null;

  if (!proxima) {
    return (
      <button
        type="button"
        onClick={onIr}
        className="mb-3 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border p-2.5 text-left transition-colors hover:bg-muted"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <CalendarPlus className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            Sin próxima gestión
          </span>
          <span className="block text-xs text-muted-foreground">
            Agendá qué sigue con este contacto.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  const c = cuando(proxima.starts_at);

  return (
    <button
      type="button"
      onClick={onIr}
      className={cn(
        'mb-3 flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
        c.vencida
          ? 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15'
          : 'border-primary/25 bg-primary/5 hover:bg-primary/10',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md',
          c.vencida ? 'bg-red-500/15 text-red-400' : 'bg-primary/10 text-primary',
        )}
      >
        {c.vencida ? (
          <AlertTriangle className="size-4" />
        ) : (
          <CalendarClock className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {proxima.title}
        </span>
        <span
          className={cn(
            'block text-xs',
            c.vencida ? 'font-medium text-red-400' : 'text-muted-foreground',
          )}
        >
          {c.texto}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
