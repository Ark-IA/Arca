'use client';

/**
 * Tareas de toda la cuenta.
 *
 * Arranca filtrada en "mías": lo primero que alguien quiere saber al abrir
 * esta pantalla es qué le toca a él, no qué le toca al equipo. Ver todo está
 * a un clic.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, Loader2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { BarraDeVistas } from '@/components/views/barra-de-vistas';
import { useIdDeBusqueda } from '@/hooks/use-id-de-busqueda';
import type { SavedView } from '@/hooks/use-saved-views';

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
  const [busqueda, setBusqueda] = useState('');
  const [vistaActiva, setVistaActiva] = useState<string | null>(null);

  /**
   * Una tarea que llega desde la búsqueda global.
   *
   * Puede no estar en el alcance elegido -- buscás una tarea de un compañero
   * mientras mirás "Mías" -- así que al llegar con `?id=` se pasa a "Todas".
   * Si no, el resultado del buscador llevaría a una lista donde esa tarea no
   * aparece, que es la peor forma de contestar una búsqueda.
   */
  const idBuscado = useIdDeBusqueda();
  useEffect(() => {
    if (idBuscado) setAlcance('todas');
  }, [idBuscado]);

  const visibles = useMemo(() => {
    let lista = tareas;

    if (alcance === 'mias') {
      lista = lista.filter((t) => t.assignee_id === user?.id);
    } else if (alcance === 'vencidas') {
      // Vencidas: solo las que siguen abiertas. Una tarea cerrada que venció
      // en su momento ya no le importa a nadie.
      const ahora = Date.now();
      lista = lista.filter(
        (t) =>
          t.due_at != null &&
          new Date(t.due_at).getTime() < ahora &&
          t.status !== 'done' &&
          t.status !== 'canceled',
      );
    }

    const q = busqueda.trim().toLowerCase();
    if (q !== '') {
      lista = lista.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.body ?? '').toLowerCase().includes(q),
      );
    }

    return lista;
  }, [tareas, alcance, user?.id, busqueda]);

  const filtrosDeVista = useMemo(
    () => ({ alcance, busqueda: busqueda.trim() }),
    [alcance, busqueda],
  );

  const aplicarVista = useCallback((v: SavedView | null) => {
    setVistaActiva(v?.id ?? null);
    if (!v) {
      setAlcance('mias');
      setBusqueda('');
      return;
    }
    const f = v.filters as { alcance?: unknown; busqueda?: unknown };
    setAlcance(
      f.alcance === 'todas' || f.alcance === 'vencidas' ? f.alcance : 'mias',
    );
    setBusqueda(typeof f.busqueda === 'string' ? f.busqueda : '');
  }, []);

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por título o descripción…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {pestana('mias', 'Mías', cuentaMias)}
          {pestana('todas', 'Todas')}
          {pestana('vencidas', 'Vencidas', cuentaVencidas, true)}
        </div>
      </div>

      <BarraDeVistas
        modulo="tasks"
        filtrosActuales={filtrosDeVista}
        vistaActivaId={vistaActiva}
        onElegir={aplicarVista}
        hayFiltros={busqueda.trim() !== '' || alcance !== 'mias'}
      />

      <ListaTareas
        tareas={visibles}
        destacarId={idBuscado}
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
