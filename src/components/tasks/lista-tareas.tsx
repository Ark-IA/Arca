'use client';

/**
 * Lista de tareas reutilizable.
 *
 * La usan la pantalla general y los paneles dentro de la ficha de un contacto
 * o una empresa. Recibe las tareas ya cargadas en vez de cargarlas ella: quien
 * la usa decide el alcance, y así el panel de un contacto no puede terminar
 * mostrando las tareas de toda la cuenta por un descuido.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { BorradorTarea } from '@/hooks/use-tasks';
import type { EstadoTarea, PrioridadTarea, Task } from '@/types';

const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  todo: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  canceled: 'Cancelada',
};

const ETIQUETA_PRIORIDAD: Record<PrioridadTarea, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
};

const COLOR_PRIORIDAD: Record<PrioridadTarea, string> = {
  low: 'border-border text-muted-foreground',
  normal: 'border-border text-foreground',
  high: 'border-red-500/40 bg-red-500/10 text-red-400',
};

/**
 * Cuándo vence, dicho como lo diría una persona.
 *
 * "Vencía hace 3 días" comunica urgencia; "2026-08-22T14:00:00Z" no comunica
 * nada sin hacer la cuenta mentalmente.
 */
function cuandoVence(iso: string | null): { texto: string; vencida: boolean } | null {
  if (!iso) return null;
  const cuando = new Date(iso).getTime();
  const dias = Math.round((cuando - Date.now()) / 86_400_000);
  if (dias < -1) return { texto: `Venció hace ${Math.abs(dias)} días`, vencida: true };
  if (dias === -1) return { texto: 'Venció ayer', vencida: true };
  if (dias === 0) return { texto: 'Vence hoy', vencida: true };
  if (dias === 1) return { texto: 'Vence mañana', vencida: false };
  if (dias < 7) return { texto: `Vence en ${dias} días`, vencida: false };
  return {
    texto: new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' }),
    vencida: false,
  };
}

export function ListaTareas({
  tareas,
  cargando,
  puedeEditar,
  onCrear,
  onActualizar,
  onBorrar,
  onAlternar,
  /** Texto del vacío, distinto en la pantalla general y en un panel. */
  vacio = 'No hay tareas.',
  compacto = false,
}: {
  tareas: Task[];
  cargando: boolean;
  puedeEditar: boolean;
  onCrear: (datos: BorradorTarea) => Promise<Task | null>;
  onActualizar: (id: string, cambios: Partial<BorradorTarea>) => Promise<boolean>;
  onBorrar: (id: string) => Promise<boolean>;
  onAlternar: (tarea: Task) => Promise<void>;
  vacio?: string;
  compacto?: boolean;
}) {
  const [titulo, setTitulo] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadTarea>('normal');
  const [creando, setCreando] = useState(false);
  const [verHechas, setVerHechas] = useState(false);

  const { pendientes, cerradas } = useMemo(() => {
    const p: Task[] = [];
    const c: Task[] = [];
    for (const t of tareas) {
      if (t.status === 'done' || t.status === 'canceled') c.push(t);
      else p.push(t);
    }
    return { pendientes: p, cerradas: c };
  }, [tareas]);

  const crear = async () => {
    const t = titulo.trim();
    if (t === '') return;
    setCreando(true);
    const nueva = await onCrear({
      title: t,
      priority: prioridad,
      // El `<input type="date">` da 'YYYY-MM-DD'; se fija a las 18:00 locales
      // porque una tarea "para el martes" no vence a las 00:00 del martes.
      due_at: vencimiento ? new Date(`${vencimiento}T18:00:00`).toISOString() : null,
    });
    setCreando(false);
    if (nueva) {
      setTitulo('');
      setVencimiento('');
      setPrioridad('normal');
    } else {
      toast.error('No se pudo crear la tarea.');
    }
  };

  const fila = (t: Task) => {
    const vence = cuandoVence(t.due_at);
    const cerrada = t.status === 'done' || t.status === 'canceled';

    return (
      <li
        key={t.id}
        className="group flex items-start gap-3 border-b border-border px-4 py-3 last:border-0"
      >
        <button
          type="button"
          disabled={!puedeEditar}
          onClick={() => void onAlternar(t)}
          aria-label={cerrada ? 'Devolver a pendiente' : 'Marcar como hecha'}
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
            cerrada
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:border-primary',
            !puedeEditar && 'cursor-not-allowed opacity-50',
          )}
        >
          {cerrada && <Check className="size-3" />}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm text-foreground',
              cerrada && 'text-muted-foreground line-through',
            )}
          >
            {t.title}
          </p>
          {t.body && !compacto && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {vence && !cerrada && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px]',
                  vence.vencida ? 'font-medium text-red-400' : 'text-muted-foreground',
                )}
              >
                {vence.vencida ? (
                  <AlertTriangle className="size-3" />
                ) : (
                  <CalendarClock className="size-3" />
                )}
                {vence.texto}
              </span>
            )}
            {t.priority !== 'normal' && !cerrada && (
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  COLOR_PRIORIDAD[t.priority],
                )}
              >
                {ETIQUETA_PRIORIDAD[t.priority]}
              </span>
            )}
            {t.status === 'in_progress' && (
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                {ETIQUETA_ESTADO.in_progress}
              </span>
            )}
          </div>
        </div>

        {puedeEditar && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {!cerrada && (
              <button
                type="button"
                onClick={() =>
                  void onActualizar(t.id, {
                    status: t.status === 'in_progress' ? 'todo' : 'in_progress',
                  })
                }
                title={t.status === 'in_progress' ? 'Volver a pendiente' : 'Marcar en curso'}
                className="rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t.status === 'in_progress' ? 'Pausar' : 'Empezar'}
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (await onBorrar(t.id)) toast.success('Tarea eliminada.');
              }}
              aria-label="Eliminar tarea"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void crear();
            }}
            placeholder="Qué hay que hacer…"
            className="flex-1"
          />
          <Input
            type="date"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
            className="w-auto shrink-0"
            aria-label="Fecha de vencimiento"
          />
          <Select
            value={prioridad}
            onValueChange={(v) => v && setPrioridad(v as PrioridadTarea)}
          >
            <SelectTrigger className="w-28 shrink-0">
              <SelectValue>{ETIQUETA_PRIORIDAD[prioridad]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{ETIQUETA_PRIORIDAD.low}</SelectItem>
              <SelectItem value="normal">{ETIQUETA_PRIORIDAD.normal}</SelectItem>
              <SelectItem value="high">{ETIQUETA_PRIORIDAD.high}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={crear} disabled={creando || titulo.trim() === ''} className="shrink-0">
            {creando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Agregar
          </Button>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : pendientes.length === 0 && cerradas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {vacio}
          </CardContent>
        </Card>
      ) : (
        <>
          {pendientes.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <ul>{pendientes.map(fila)}</ul>
              </CardContent>
            </Card>
          )}

          {cerradas.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setVerHechas((p) => !p)}
                className="mb-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {verHechas ? 'Ocultar' : 'Ver'} {cerradas.length}{' '}
                {cerradas.length === 1 ? 'terminada' : 'terminadas'}
              </button>
              {verHechas && (
                <Card>
                  <CardContent className="p-0">
                    <ul>{cerradas.map(fila)}</ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
