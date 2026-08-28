'use client';

/**
 * Empresas.
 *
 * Hasta la migración 047 la empresa de un contacto era texto libre, así que
 * "Acme", "ACME S.A." y "acme" eran tres empresas distintas y no había forma
 * de listar los contactos de una ni de ver cuánto se le vendió. Esta pantalla
 * es la entidad de verdad.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CompanyForm } from '@/components/companies/company-form';
import { BarraDeVistas } from '@/components/views/barra-de-vistas';
import { useIdDeBusqueda } from '@/hooks/use-id-de-busqueda';
import type { SavedView } from '@/hooks/use-saved-views';
import { useCompanies, type BorradorEmpresa } from '@/hooks/use-companies';
import { useAuth } from '@/hooks/use-auth';
import { canSendMessages, canEditSettings } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import type { Company } from '@/types';

function formatearImporte(valor: number | null, moneda: string): string {
  if (valor == null) return '—';
  // `Intl` con notación compacta: 1.2M en vez de 1.200.000, que en una celda
  // de tabla obliga a ensancharla o a cortarla.
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: moneda,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(valor);
}

export default function PaginaEmpresas() {
  const { empresas, cargando, error, crear, actualizar, borrar } = useCompanies();
  const { accountRole, defaultCurrency } = useAuth();
  const puedeEditar = accountRole ? canSendMessages(accountRole) : false;
  const puedeBorrar = accountRole ? canEditSettings(accountRole) : false;

  const [busqueda, setBusqueda] = useState('');
  const [soloIdeales, setSoloIdeales] = useState(false);
  const [vistaActiva, setVistaActiva] = useState<string | null>(null);

  // Lo que una vista guardada recuerda de esta pantalla.
  const filtrosActuales = useMemo(
    () => ({ busqueda: busqueda.trim(), soloIdeales }),
    [busqueda, soloIdeales],
  );

  const aplicarVista = useCallback((v: SavedView | null) => {
    setVistaActiva(v?.id ?? null);
    if (!v) {
      setBusqueda('');
      setSoloIdeales(false);
      return;
    }
    const f = v.filters as { busqueda?: unknown; soloIdeales?: unknown };
    // Se comprueba el tipo de cada campo: el JSON viene de la base y una vista
    // guardada por una versión anterior puede traer una forma distinta.
    setBusqueda(typeof f.busqueda === 'string' ? f.busqueda : '');
    setSoloIdeales(f.soloIdeales === true);
  }, []);
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Company | null>(null);
  const [borrando, setBorrando] = useState<Company | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return empresas.filter((e) => {
      if (soloIdeales && !e.is_ideal_customer) return false;
      if (q === '') return true;
      // Se busca por nombre, dominio, sector y ciudad: son los cuatro por los
      // que alguien recuerda una empresa cuando no recuerda el nombre exacto.
      return [e.name, e.domain, e.industry, e.city]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(q));
    });
  }, [empresas, busqueda, soloIdeales]);

  const totalIdeales = empresas.filter((e) => e.is_ideal_customer).length;

  // Empresa a la que se llega desde la búsqueda global: se resalta y se
  // desplaza hasta ella. Cualquier filtro activo se limpia primero, o el
  // resultado buscado podría quedar fuera de la lista visible.
  const idBuscado = useIdDeBusqueda();
  const refDestacada = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!idBuscado) return;
    setBusqueda('');
    setSoloIdeales(false);
    const t = setTimeout(() => {
      refDestacada.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => clearTimeout(t);
  }, [idBuscado, empresas]);

  const abrirNueva = () => {
    setEditando(null);
    setFormAbierto(true);
  };

  const guardar = async (datos: BorradorEmpresa): Promise<boolean> => {
    if (editando) {
      const ok = await actualizar(editando.id, datos);
      if (ok) toast.success('Empresa actualizada.');
      else toast.error(error ?? 'No se pudo guardar.');
      return ok;
    }
    const nueva = await crear(datos);
    if (nueva) toast.success(`${nueva.name} creada.`);
    else toast.error(error ?? 'No se pudo crear.');
    return !!nueva;
  };

  const confirmarBorrado = async () => {
    if (!borrando) return;
    setOcupado(true);
    const ok = await borrar(borrando.id);
    setOcupado(false);
    if (ok) {
      toast.success(`${borrando.name} eliminada.`);
      setBorrando(null);
    } else {
      toast.error(error ?? 'No se pudo eliminar.');
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {empresas.length === 0
              ? 'Todavía no hay ninguna.'
              : `${empresas.length} ${empresas.length === 1 ? 'empresa' : 'empresas'}${
                  totalIdeales > 0 ? ` · ${totalIdeales} marcadas como cliente ideal` : ''
                }`}
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={abrirNueva}>
            <Plus className="size-4" />
            Nueva empresa
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, dominio, sector o ciudad…"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setSoloIdeales((p) => !p)}
          className={cn(
            'shrink-0',
            soloIdeales
              ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
              : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          <Star className={cn('size-4', soloIdeales && 'fill-primary')} />
          Cliente ideal
        </Button>
      </div>

      <BarraDeVistas
        modulo="companies"
        filtrosActuales={filtrosActuales}
        vistaActivaId={vistaActiva}
        onElegir={aplicarVista}
        hayFiltros={busqueda.trim() !== '' || soloIdeales}
      />

      {filtradas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Building2 className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {empresas.length === 0
                ? 'Todavía no cargaste ninguna empresa'
                : 'Ninguna coincide con la búsqueda'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {empresas.length === 0
                ? 'Las empresas agrupan a tus contactos y te dejan ver por cliente, no solo por persona.'
                : 'Prueba con otro término, o quita el filtro de cliente ideal.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((e) => (
            <Card
              key={e.id}
              ref={e.id === idBuscado ? refDestacada : undefined}
              className={cn(
                'group relative overflow-hidden transition-all',
                // Hover: se levanta y el borde toma el color de marca. Sin
                // esto las tarjetas se leen como un mural estático y no como
                // algo con lo que se puede interactuar.
                'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
                e.id === idBuscado && 'border-primary/50 ring-2 ring-primary/30',
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {e.name}
                      </h2>
                      {e.is_ideal_customer && (
                        <Star
                          className="size-3.5 shrink-0 fill-primary text-primary"
                          aria-label="Cliente ideal"
                        />
                      )}
                    </div>
                    {e.industry && (
                      <p className="truncate text-xs text-muted-foreground">
                        {e.industry}
                      </p>
                    )}
                  </div>

                  {/* Los botones aparecen al pasar por encima. Siempre visibles
                      serían seis iconos por tarjeta compitiendo con el dato. */}
                  {puedeEditar && (
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(e);
                          setFormAbierto(true);
                        }}
                        aria-label={`Editar ${e.name}`}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      {puedeBorrar && (
                        <button
                          type="button"
                          onClick={() => setBorrando(e)}
                          aria-label={`Eliminar ${e.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  {e.domain && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Globe className="size-3.5 shrink-0" />
                      <span className="truncate">{e.domain}</span>
                    </div>
                  )}
                  {(e.city || e.country) && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {[e.city, e.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-3.5 shrink-0" />
                    <span>
                      {e.contact_count ?? 0}{' '}
                      {e.contact_count === 1 ? 'contacto' : 'contactos'}
                      {e.employees != null && ` · ${e.employees} empleados`}
                    </span>
                  </div>
                </dl>

                {e.annual_revenue != null && (
                  <p className="mt-3 border-t border-border pt-2 text-sm font-semibold tabular-nums text-foreground">
                    {formatearImporte(e.annual_revenue, defaultCurrency ?? 'USD')}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      al año
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CompanyForm
        abierto={formAbierto}
        empresa={editando}
        onCerrar={() => setFormAbierto(false)}
        onGuardar={guardar}
      />

      <Dialog open={borrando !== null} onOpenChange={(o) => !o && setBorrando(null)}>
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Eliminar {borrando?.name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Sus contactos NO se borran: siguen existiendo, solo se quedan sin
              empresa. Las notas, tareas y adjuntos colgados de la empresa sí se
              van con ella.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBorrando(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarBorrado}
              disabled={ocupado}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
