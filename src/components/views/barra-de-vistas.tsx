'use client';

/**
 * Barra de vistas guardadas, para cualquier módulo.
 *
 * Recibe los filtros que la pantalla tiene puestos ahora y devuelve los de la
 * vista que se elija. No sabe qué significan: para un módulo son etiquetas,
 * para otro un rango de fechas. Esa ignorancia es lo que la hace reutilizable.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck, Loader2, Pin, Plus, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSavedViews, type ModuloDeVista, type SavedView } from '@/hooks/use-saved-views';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export function BarraDeVistas({
  modulo,
  filtrosActuales,
  vistaActivaId,
  onElegir,
  /** True cuando hay algún filtro puesto: sin filtros no hay nada que guardar. */
  hayFiltros,
}: {
  modulo: ModuloDeVista;
  filtrosActuales: Record<string, unknown>;
  vistaActivaId: string | null;
  onElegir: (vista: SavedView | null) => void;
  hayFiltros: boolean;
}) {
  const { user } = useAuth();
  const { vistas, cargando, guardar, borrar, marcarPorDefecto } = useSavedViews(modulo);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  /**
   * La vista marcada por defecto se aplica una sola vez, al cargar.
   *
   * Sin el candado, cada recarga de la lista volvería a aplicarla y pisaría
   * los filtros que la persona acabara de cambiar a mano.
   */
  const yaAplicoPorDefecto = useRef(false);
  useEffect(() => {
    if (cargando || yaAplicoPorDefecto.current) return;
    yaAplicoPorDefecto.current = true;
    const porDefecto = vistas.find((v) => v.is_default);
    if (porDefecto) onElegir(porDefecto);
  }, [cargando, vistas, onElegir]);

  const crear = async () => {
    const n = nombre.trim();
    if (n === '') return;
    setGuardando(true);
    const nueva = await guardar(n, filtrosActuales);
    setGuardando(false);
    if (nueva) {
      toast.success(`Vista “${n}” guardada.`);
      setNombre('');
      setAbierto(false);
      onElegir(nueva);
    } else {
      toast.error('No se pudo guardar la vista.');
    }
  };

  if (cargando && vistas.length === 0) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onElegir(null)}
        className={cn(
          'rounded-lg border px-2.5 py-1 text-xs transition-colors',
          vistaActivaId === null
            ? 'border-primary/30 bg-primary/10 font-medium text-primary'
            : 'border-border text-muted-foreground hover:bg-muted',
        )}
      >
        Todo
      </button>

      {vistas.map((v) => {
        const activa = v.id === vistaActivaId;
        const mia = v.user_id === user?.id;
        return (
          <span key={v.id} className="group relative inline-flex">
            <button
              type="button"
              onClick={() => onElegir(v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border py-1 pl-2.5 text-xs transition-colors',
                // Sitio para los botones que aparecen al pasar por encima,
                // reservado siempre: si se sumara al hacer hover, la pestaña
                // cambiaría de ancho y las de al lado se moverían.
                mia ? 'pr-12' : 'pr-2.5',
                activa
                  ? 'border-primary/30 bg-primary/10 font-medium text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {v.is_default ? (
                <Pin className="size-3 shrink-0" />
              ) : v.is_shared ? (
                <Users className="size-3 shrink-0" />
              ) : (
                <Bookmark className="size-3 shrink-0" />
              )}
              {v.name}
            </button>

            {mia && (
              <span className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => void marcarPorDefecto(v.is_default ? null : v.id)}
                  aria-label={
                    v.is_default ? 'Quitar como vista inicial' : 'Abrir esta vista al entrar'
                  }
                  title={
                    v.is_default ? 'Quitar como vista inicial' : 'Abrir esta vista al entrar'
                  }
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {v.is_default ? (
                    <BookmarkCheck className="size-3" />
                  ) : (
                    <Bookmark className="size-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (await borrar(v.id)) {
                      if (activa) onElegir(null);
                      toast.success('Vista eliminada.');
                    }
                  }}
                  aria-label={`Eliminar la vista ${v.name}`}
                  className="rounded p-0.5 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            )}
          </span>
        );
      })}

      {hayFiltros && (
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-[26px] border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-3" />
                Guardar vista
              </Button>
            }
          />
          <PopoverContent className="w-64 space-y-2 p-3">
            <p className="text-xs text-muted-foreground">
              Guarda los filtros que tienes puestos ahora. El equipo la va a ver.
            </p>
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void crear();
              }}
              placeholder="Ej: Clientes de Bogotá"
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={crear}
              disabled={guardando || nombre.trim() === ''}
              className="w-full"
            >
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : 'Guardar'}
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
