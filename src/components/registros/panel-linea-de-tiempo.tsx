'use client';

/**
 * Línea de tiempo de un registro: qué le pasó y cuándo.
 *
 * Solo lectura, y no por comodidad: la migración 047 le dio a
 * `timeline_events` una única política, la de SELECT. RLS deniega por defecto,
 * así que ni siquiera un cliente manipulado puede escribir acá. La escribe el
 * servidor con la clave de servicio. Una línea de tiempo editable desde el
 * navegador no sirve como registro de nada.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  CircleDot,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  UserPlus,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { COLUMNA_POR_TIPO } from '@/lib/registros/vinculos';
import type { TimelineEvent, TipoDeRegistro } from '@/types';

/**
 * Icono por familia de evento. `event_type` es texto libre en la base a
 * propósito -- cada módulo nuevo trae verbos nuevos y una enumeración
 * obligaría a migrar para registrar un evento -- así que acá se agrupa por
 * prefijo y cualquier verbo desconocido cae en un punto neutro.
 */
function iconoDe(tipo: string) {
  if (tipo.startsWith('message')) return MessageSquare;
  if (tipo.startsWith('call')) return Phone;
  if (tipo.startsWith('note')) return StickyNote;
  if (tipo.startsWith('email')) return Mail;
  if (tipo.startsWith('contact') || tipo.startsWith('company')) return UserPlus;
  if (tipo.startsWith('deal') || tipo.startsWith('stage')) return ArrowRightLeft;
  return CircleDot;
}

function cuando(iso: string): string {
  const d = new Date(iso);
  const dias = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (dias === 0)
    return `Hoy ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  if (dias === 1)
    return `Ayer ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  if (dias < 7) return `Hace ${dias} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PanelLineaDeTiempo({
  tipo,
  registroId,
}: {
  tipo: TipoDeRegistro;
  registroId: string;
}) {
  const { accountId } = useAuth();
  const [eventos, setEventos] = useState<TimelineEvent[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    const { data } = await createClient()
      .from('timeline_events')
      .select('*')
      .eq('account_id', accountId)
      .eq(COLUMNA_POR_TIPO[tipo], registroId)
      .order('occurred_at', { ascending: false })
      // Cien es suficiente para revisar una relación; sin tope, una ficha con
      // años de actividad traería miles de filas para pintar una columna.
      .limit(100);
    setEventos((data ?? []) as TimelineEvent[]);
    setCargando(false);
  }, [accountId, tipo, registroId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-center">
        <CircleDot className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Todavía no pasó nada aquí.</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Se va llenando sola con los mensajes, las llamadas y los cambios de
          estado.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 pl-6">
      {/* La línea vertical que une los hitos. Va detrás de los puntos, con
          `aria-hidden`: es decoración, no información. */}
      <span
        aria-hidden
        className="absolute bottom-2 left-[7px] top-2 w-px bg-border"
      />
      {eventos.map((e) => {
        const Icono = iconoDe(e.event_type);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-6 top-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <Icono className="size-2.5" />
            </span>
            <p className="text-sm text-foreground">{e.title}</p>
            {e.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
            )}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {cuando(e.occurred_at)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
