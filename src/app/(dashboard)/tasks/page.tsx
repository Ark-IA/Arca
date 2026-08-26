'use client';

/**
 * Tareas de toda la cuenta.
 *
 * Arranca filtrada en "mías": lo primero que alguien quiere saber al abrir
 * esta pantalla es qué le toca a él, no qué le toca al equipo. Ver todo está
 * a un clic.
 */

import { useMemo, useState } from 'react';
import { CheckSquare, Loader2 } from 'lucide-react';

import { ListaTareas } from '@/components/tasks/lista-tareas';
import { useTasks } from '@/hooks/use-tasks';
import { useAuth } from '@/hooks/use-auth';
import { canSendMessages } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Alcance = 'mias' | 'todas' | 'vencidas';

export default function PaginaTareas() {
  const { tareas, cargando, crear, actualizar, borrar, alternarHecha } = useTasks();
  const { user, accountRole } = useAuth();
  const puedeEditar = accountRole ? canSendMessages(accountRole) : false;

  const [alcance, setAlcance] = useState<Alcance>('mias');

  const visibles = useMemo(() => {
    if (alcance === 'todas') return tareas;
    if (alcance === 'mias') return tareas.filter((t) => t.assignee_id === user?.id);
    // Vencidas: solo las que siguen abiertas. Una tarea cerrada que venció en
    // su momento ya no le importa a nadie.
    const ahora = Date.now();
    return tareas.filter(
      (t) =>
        t.due_at != null &&
        new Date(t.due_at).getTime() < ahora &&
        t.status !== 'done' &&
        t.status !== 'canceled',
    );
  }, [tareas, alcance, user?.id]);

  const cuentaVencidas = useMemo(() => {
    const ahora = Date.now();
    return tareas.filter(
      (t) =>
        t.due_at != null &&
        new Date(t.due_at).getTime() < ahora &&
        t.status !== 'done' &&
        t.status !== 'canceled',
    ).length;
  }, [tareas]);

  const cuentaMias = useMemo(
    () =>
      tareas.filter(
        (t) => t.assignee_id === user?.id && t.status !== 'done' && t.status !== 'canceled',
      ).length,
    [tareas, user?.id],
  );

  const pestana = (valor: Alcance, texto: string, cuenta?: number, alerta?: boolean) => (
    <Button
      key={valor}
      variant="outline"
      onClick={() => setAlcance(valor)}
      className={cn(
        'shrink-0',
        alcance === valor
          ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {texto}
      {cuenta != null && cuenta > 0 && (
        <span
          className={cn(
            'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            alerta ? 'bg-red-500/15 text-red-400' : 'bg-muted text-muted-foreground',
          )}
        >
          {cuenta}
        </span>
      )}
    </Button>
  );

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <CheckSquare className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tareas</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lo que hay que hacer, con responsable y plazo. Se pueden colgar de un
            contacto, una empresa o un negocio.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {pestana('mias', 'Mías', cuentaMias)}
        {pestana('todas', 'Todas')}
        {pestana('vencidas', 'Vencidas', cuentaVencidas, true)}
      </div>

      <ListaTareas
        tareas={visibles}
        cargando={false}
        puedeEditar={puedeEditar}
        onCrear={(d) => crear(d)}
        onActualizar={actualizar}
        onBorrar={borrar}
        onAlternar={alternarHecha}
        vacio={
          alcance === 'vencidas'
            ? 'Nada vencido. Al día.'
            : alcance === 'mias'
              ? 'No tenés tareas asignadas.'
              : 'Todavía no hay tareas.'
        }
      />
    </div>
  );
}
