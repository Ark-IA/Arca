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
  CalendarClock,
  CheckSquare,
  CircleDot,
  DollarSign,
  Globe,
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
  if (tipo.startsWith('web')) return Globe;
  if (tipo.startsWith('message')) return MessageSquare;
  if (tipo.startsWith('call')) return Phone;
  if (tipo.startsWith('note')) return StickyNote;
  if (tipo.startsWith('email')) return Mail;
  if (tipo.startsWith('task')) return CheckSquare;
  if (tipo.startsWith('appointment') || tipo.startsWith('calendar')) return CalendarClock;
  if (tipo.startsWith('contact') || tipo.startsWith('company')) return UserPlus;
  // Crear una oportunidad y moverla de etapa son cosas distintas: la flecha
  // dice «se movió» y no ayuda cuando lo que pasó fue que nació.
  if (tipo === 'deal.created') return DollarSign;
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
  conChat = true,
}: {
  tipo: TipoDeRegistro;
  registroId: string;
  /**
   * ¿Se cuentan también los mensajes del chat?
   *
   * En la ficha del contacto, no: la conversación está al lado, entera y en
   * su forma natural. Repetirla acá, línea por línea y sin poder responder,
   * hundía lo que solo se puede ver aquí —que se creó el contacto, que
   * alguien dejó una nota, que se agendó una visita— entre cien mensajes.
   *
   * El filtro está en la pantalla y no en la base a propósito: el dato se
   * sigue guardando, porque una vista general de actividad sí lo quiere.
   */
  conChat?: boolean;
}) {
  const { accountId } = useAuth();
  const [eventos, setEventos] = useState<TimelineEvent[]>([]);
  const [cargando, setCargando] = useState(true);

  // Lo que se está pidiendo ahora mismo. Al cambiar de registro se vacía la
  // lista y se vuelve a «cargando» AQUÍ, al dibujar, y no desde el efecto:
  // desde el efecto habría un instante en el que la actividad del contacto
  // anterior ya está en pantalla debajo del nombre del nuevo.
  const clave = `${accountId ?? ''}|${tipo}|${registroId}|${conChat}`;
  const [pedido, setPedido] = useState(clave);
  if (pedido !== clave) {
    setPedido(clave);
    setEventos([]);
    setCargando(true);
  }

  const cargar = useCallback(async () => {
    if (!accountId) return;
    let consulta = createClient()
      .from('timeline_events')
      .select('*')
      .eq('account_id', accountId)
      .eq(COLUMNA_POR_TIPO[tipo], registroId);

    if (!conChat) {
      // `not like 'message%'` y no una lista de tipos: `event_type` es texto
      // libre a propósito —cada módulo nuevo trae verbos nuevos— así que una
      // lista cerrada se quedaría corta con el primero que se agregue.
      consulta = consulta.not('event_type', 'like', 'message%');
    }

    const { data } = await consulta
      .order('occurred_at', { ascending: false })
      // Desempate. `occurred_at` es la hora de la TRANSACCIÓN, así que dos
      // cosas hechas en el mismo guardado —crear una tarea y cerrarla, mover
      // una oportunidad al crearla— comparten hora exacta y quedarían en
      // orden arbitrario, distinto en cada recarga.
      .order('created_at', { ascending: false })
      // Cien es suficiente para revisar una relación; sin tope, una ficha con
      // años de actividad traería miles de filas para pintar una columna.
      .limit(100);
    setEventos((data ?? []) as TimelineEvent[]);
    setCargando(false);
  }, [accountId, tipo, registroId, conChat]);

  useEffect(() => {
    // El estado se toca dentro de la respuesta de Supabase —ya fuera del
    // cuerpo del efecto— y el «cargando» de entrada se pone al dibujar, más
    // arriba. La regla no puede ver esa diferencia: sigue el `useCallback` y
    // encuentra los `setX`, sin distinguir si están antes o después del
    // `await`. La cascada que la regla previene no ocurre acá.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          Se va llenando sola: notas, llamadas, tareas, citas y cambios de
          estado quedan registrados acá a medida que ocurren.
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
