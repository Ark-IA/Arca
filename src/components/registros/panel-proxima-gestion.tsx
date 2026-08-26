'use client';

/**
 * Próxima gestión de un contacto.
 *
 * "Con este cliente, ¿qué sigue y cuándo?" es la pregunta que sostiene un CRM.
 * Sin un sitio donde contestarla, los seguimientos viven en la cabeza de cada
 * vendedor y se pierden.
 *
 * Lo que se agenda acá es un evento de calendario de verdad, no una lista
 * aparte: aparece en la agenda del equipo junto con todo lo demás. Un
 * "próximo paso" que solo se ve dentro de la ficha del contacto no lo mira
 * nadie hasta que ya pasó la fecha.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Trash2,
  Users,
  Video,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types';

/**
 * Los tipos de gestión. Cada uno trae un título ya escrito: la gracia de este
 * panel es agendar el seguimiento en cinco segundos, y obligar a redactar un
 * título es lo que hace que la gente no lo agende.
 */
const GESTIONES = [
  { id: 'llamada', etiqueta: 'Llamar', titulo: 'Llamada de seguimiento', icono: Phone },
  { id: 'reunion', etiqueta: 'Reunión', titulo: 'Reunión', icono: Users },
  { id: 'demo', etiqueta: 'Demostración', titulo: 'Demostración del producto', icono: Video },
  {
    id: 'seguimiento',
    etiqueta: 'Seguimiento',
    titulo: 'Seguimiento comercial',
    icono: CheckCircle2,
  },
] as const;

type IdGestion = (typeof GESTIONES)[number]['id'];

/** Atajos de fecha. Elegir "mañana" no debería costar abrir un calendario. */
const ATAJOS: { etiqueta: string; dias: number }[] = [
  { etiqueta: 'Mañana', dias: 1 },
  { etiqueta: 'En 3 días', dias: 3 },
  { etiqueta: 'En 1 semana', dias: 7 },
  { etiqueta: 'En 15 días', dias: 15 },
];

function aValorDeFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return aValorDeFecha(d);
}

function cuandoFalta(iso: string): { texto: string; vencida: boolean } {
  const dias = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (dias < -1) return { texto: `Hace ${Math.abs(dias)} días`, vencida: true };
  if (dias === -1) return { texto: 'Ayer', vencida: true };
  if (dias === 0) return { texto: 'Hoy', vencida: false };
  if (dias === 1) return { texto: 'Mañana', vencida: false };
  if (dias < 14) return { texto: `En ${dias} días`, vencida: false };
  return {
    texto: new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' }),
    vencida: false,
  };
}

export function PanelProximaGestion({
  contactId,
  /** Empresa del contacto, para que el evento también quede colgado de ella. */
  companyId,
  puedeEditar,
  /** Aviso a la ficha de que hay una gestión nueva, para que refresque. */
  onAgendado,
}: {
  contactId: string;
  companyId: string | null;
  puedeEditar: boolean;
  onAgendado?: () => void;
}) {
  const { accountId, user } = useAuth();
  const [eventos, setEventos] = useState<CalendarEvent[]>([]);
  const [cargando, setCargando] = useState(true);

  const [gestion, setGestion] = useState<IdGestion>('llamada');
  const [fecha, setFecha] = useState(enDias(1));
  const [hora, setHora] = useState('09:00');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    const { data, error } = await createClient()
      .from('calendar_events')
      .select('*, empresa:companies(id, name)')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .neq('status', 'canceled')
      .order('starts_at', { ascending: true });
    if (error) {
      toast.error('No se pudieron cargar las gestiones.');
      setCargando(false);
      return;
    }
    setEventos((data ?? []) as CalendarEvent[]);
    setCargando(false);
  }, [accountId, contactId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agendar = async () => {
    if (!accountId || !user || fecha === '') return;
    const elegida = GESTIONES.find((g) => g.id === gestion)!;
    setGuardando(true);

    const inicio = new Date(`${fecha}T${hora}`);
    // Media hora por defecto. Es lo que dura una llamada de seguimiento, y
    // pedir la hora de fin acá arruinaría el punto de que sean cinco segundos.
    const fin = new Date(inicio.getTime() + 30 * 60 * 1000);

    const { error } = await createClient().from('calendar_events').insert({
      account_id: accountId,
      user_id: user.id,
      title: elegida.titulo,
      description: nota.trim() || null,
      starts_at: inicio.toISOString(),
      ends_at: fin.toISOString(),
      contact_id: contactId,
      // La empresa se copia del contacto: así la gestión aparece también en la
      // ficha de la empresa, que es donde mira quien lleva la cuenta y no la
      // persona.
      company_id: companyId,
    });

    setGuardando(false);
    if (error) {
      toast.error('No se pudo agendar.');
      return;
    }
    setNota('');
    await cargar();
    onAgendado?.();
    toast.success('Agendado. Ya aparece en el calendario.');
  };

  const eliminar = async (id: string) => {
    const { error } = await createClient().from('calendar_events').delete().eq('id', id);
    if (error) {
      toast.error('No se pudo eliminar.');
      return;
    }
    setEventos((p) => p.filter((e) => e.id !== id));
  };

  const proximas = eventos.filter((e) => new Date(e.ends_at).getTime() >= Date.now());
  const pasadas = eventos.filter((e) => new Date(e.ends_at).getTime() < Date.now());

  const fila = (e: CalendarEvent, atenuada: boolean) => {
    const falta = cuandoFalta(e.starts_at);
    return (
      <li
        key={e.id}
        className={cn(
          'group flex items-start gap-2.5 rounded-lg border border-border bg-card p-2.5',
          atenuada && 'opacity-60',
        )}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Clock className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{e.title}</p>
          <p className="text-xs">
            <span className={cn(falta.vencida ? 'font-medium text-red-400' : 'text-muted-foreground')}>
              {falta.texto}
            </span>
            <span className="text-muted-foreground">
              {' · '}
              {new Date(e.starts_at).toLocaleString('es', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </p>
          {e.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
          )}
        </div>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => void eliminar(e.id)}
            aria-label="Eliminar la gestión"
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Qué sigue</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {GESTIONES.map((g) => {
                const Icono = g.icono;
                const elegido = g.id === gestion;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGestion(g.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                      elegido
                        ? 'border-primary/30 bg-primary/10 font-medium text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icono className="size-3.5 shrink-0" />
                    {g.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cuándo</Label>
            <div className="flex flex-wrap gap-1.5">
              {ATAJOS.map((a) => {
                const valor = enDias(a.dias);
                return (
                  <button
                    key={a.etiqueta}
                    type="button"
                    onClick={() => setFecha(valor)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] transition-colors',
                      fecha === valor
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {a.etiqueta}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-8 flex-1 text-sm"
                aria-label="Fecha de la gestión"
              />
              <Input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="h-8 w-28 text-sm"
                aria-label="Hora de la gestión"
              />
            </div>
          </div>

          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota para el recordatorio (opcional)"
            rows={2}
            className="text-sm"
          />

          <Button
            size="sm"
            onClick={agendar}
            disabled={guardando || fecha === ''}
            className="w-full"
          >
            {guardando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CalendarPlus className="size-3.5" />
            )}
            Agendar
          </Button>

          {!companyId && (
            <p className="text-[11px] text-muted-foreground">
              Este contacto no tiene empresa asignada, así que la gestión solo va
              a quedar colgada de la persona.
            </p>
          )}
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {proximas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pendientes
              </p>
              <ul className="space-y-1.5">{proximas.map((e) => fila(e, false))}</ul>
            </div>
          )}

          {proximas.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <CalendarPlus className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Sin próxima gestión agendada.</p>
            </div>
          )}

          {pasadas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ya pasaron
              </p>
              <ul className="space-y-1.5">{pasadas.slice(0, 5).map((e) => fila(e, true))}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
