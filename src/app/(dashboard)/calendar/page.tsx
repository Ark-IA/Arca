'use client';

/**
 * Calendario.
 *
 * Rejilla mensual con la agenda de la cuenta. La semana empieza en lunes, que
 * es como se lee un calendario en español; el domingo al final agrupa el fin
 * de semana en vez de partirlo entre las dos puntas de la fila.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  UserRound,
  Video,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCalendar } from '@/hooks/use-calendar';
import { useAuth } from '@/hooks/use-auth';
import { canSendMessages } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Fecha local en el formato que espera `<input type="date">`. */
function aValorDeFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function PaginaCalendario() {
  const { accountRole } = useAuth();
  const puedeEditar = accountRole ? canSendMessages(accountRole) : false;

  const [mesVisible, setMesVisible] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });

  /**
   * La rejilla se rellena con días del mes anterior y del siguiente hasta
   * completar semanas enteras, así que el rango que se consulta es el de la
   * rejilla, no el del mes: si no, las reuniones de esos días asomados
   * aparecerían vacías.
   */
  const { celdas, desde, hasta } = useMemo(() => {
    const primero = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
    // getDay() da 0 para domingo; se corre para que lunes sea 0.
    const desplazamiento = (primero.getDay() + 6) % 7;
    const inicio = new Date(primero);
    inicio.setDate(primero.getDate() - desplazamiento);

    const dias: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      dias.push(d);
    }
    const fin = new Date(dias[41]);
    fin.setHours(23, 59, 59, 999);
    return { celdas: dias, desde: inicio, hasta: fin };
  }, [mesVisible]);

  const { eventos, cargando, error, crear, borrar } = useCalendar(desde, hasta);

  const porDia = useMemo(() => {
    const mapa = new Map<string, CalendarEvent[]>();
    for (const e of eventos) {
      const clave = aValorDeFecha(new Date(e.starts_at));
      const lista = mapa.get(clave);
      if (lista) lista.push(e);
      else mapa.set(clave, [e]);
    }
    return mapa;
  }, [eventos]);

  const [diaElegido, setDiaElegido] = useState<Date | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [lugar, setLugar] = useState('');
  const [enlace, setEnlace] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('10:00');
  const [guardando, setGuardando] = useState(false);

  const abrirForm = (dia: Date) => {
    setFecha(aValorDeFecha(dia));
    setTitulo('');
    setDescripcion('');
    setLugar('');
    setEnlace('');
    setHoraInicio('09:00');
    setHoraFin('10:00');
    setFormAbierto(true);
  };

  const guardar = async () => {
    if (titulo.trim() === '' || fecha === '') return;
    setGuardando(true);
    const nuevo = await crear({
      title: titulo.trim(),
      description: descripcion.trim() || null,
      location: lugar.trim() || null,
      meeting_url: enlace.trim() || null,
      // Se construye con la hora local y se manda en UTC: guardar la cadena
      // tal cual haría que la reunión se moviera al cambiar de zona horaria.
      starts_at: new Date(`${fecha}T${horaInicio}`).toISOString(),
      ends_at: new Date(`${fecha}T${horaFin}`).toISOString(),
    });
    setGuardando(false);
    if (nuevo) {
      toast.success('Evento agendado.');
      setFormAbierto(false);
    } else {
      toast.error(error ?? 'No se pudo agendar.');
    }
  };

  const hoy = new Date();
  const nombreMes = mesVisible.toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
  });

  const irA = (delta: number) =>
    setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const eventosDelDia = diaElegido ? (porDia.get(aValorDeFecha(diaElegido)) ?? []) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <CalendarDays className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold capitalize text-foreground">{nombreMes}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {eventos.length === 0
                ? 'Sin eventos este mes.'
                : `${eventos.length} ${eventos.length === 1 ? 'evento' : 'eventos'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => irA(-1)}
            aria-label="Mes anterior"
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setMesVisible(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Hoy
          </Button>
          <Button
            variant="outline"
            onClick={() => irA(1)}
            aria-label="Mes siguiente"
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </Button>
          {puedeEditar && (
            <Button onClick={() => abrirForm(hoy)}>
              <Plus className="size-4" />
              Nuevo
            </Button>
          )}
        </div>
      </div>

      {/* Qué significa cada color. Sin esto, el rojo de una gestión vencida se
          lee como un error de la aplicación en vez de como un aviso. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/40" />
          Gestión con un contacto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-500/40" />
          Gestión vencida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/30" />
          Otro evento
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b border-border">
            {DIAS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {cargando ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {celdas.map((dia, i) => {
                const delMes = dia.getMonth() === mesVisible.getMonth();
                const esHoy = mismoDia(dia, hoy);
                const delDia = porDia.get(aValorDeFecha(dia)) ?? [];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDiaElegido(dia)}
                    onDoubleClick={() => puedeEditar && abrirForm(dia)}
                    className={cn(
                      'min-h-24 border-b border-r border-border p-1.5 text-left align-top transition-colors last:border-r-0',
                      'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary',
                      // Los días asomados de otro mes se atenúan: siguen ahí
                      // para completar la semana, pero no compiten.
                      !delMes && 'bg-muted/20',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                        esHoy
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : delMes
                            ? 'text-foreground'
                            : 'text-muted-foreground/50',
                      )}
                    >
                      {dia.getDate()}
                    </span>

                    <div className="mt-1 space-y-0.5">
                      {/* Como mucho tres por celda: con más, la rejilla crece
                          y el mes deja de verse de un vistazo. */}
                      {delDia.slice(0, 3).map((e) => {
                        // Se muestra CON QUIÉN antes que el título: en una
                        // celda de calendario "Llamada de seguimiento" se
                        // repite diez veces y no distingue nada; el nombre
                        // del cliente sí.
                        const conQuien =
                          e.contacto?.name || e.empresa?.name || e.contacto?.phone;
                        // Una gestión (atada a un contacto) se pinta distinto
                        // de una reunión suelta: al mirar el mes de un vistazo,
                        // lo que interesa distinguir es "qué le debo a un
                        // cliente" de "qué tengo agendado".
                        const esGestion = !!e.contact_id;
                        const vencida =
                          esGestion &&
                          e.status !== 'canceled' &&
                          new Date(e.ends_at).getTime() < Date.now();
                        return (
                          <span
                            key={e.id}
                            title={`${e.title}${conQuien ? ` · ${conQuien}` : ''}`}
                            className={cn(
                              'block truncate rounded px-1 py-0.5 text-[10px]',
                              e.status === 'canceled'
                                ? 'bg-muted text-muted-foreground line-through'
                                : vencida
                                  ? 'bg-red-500/15 font-medium text-red-400'
                                  : esGestion
                                    ? 'bg-primary/15 font-medium text-primary'
                                    : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {new Date(e.starts_at).toLocaleTimeString('es', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            {conQuien ?? e.title}
                          </span>
                        );
                      })}
                      {delDia.length > 3 && (
                        <span className="block px-1 text-[10px] text-muted-foreground">
                          +{delDia.length - 3} más
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle del día */}
      <Dialog open={diaElegido !== null} onOpenChange={(o) => !o && setDiaElegido(null)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize text-popover-foreground">
              {diaElegido?.toLocaleDateString('es', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {eventosDelDia.length === 0
                ? 'No hay nada agendado.'
                : `${eventosDelDia.length} ${eventosDelDia.length === 1 ? 'evento' : 'eventos'}`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {eventosDelDia.map((e) => (
              <div
                key={e.id}
                className="group rounded-lg border border-border p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{e.title}</p>

                    {/* Con quién es. Es lo primero que se necesita saber antes
                        de entrar a una reunión, así que va arriba de la hora. */}
                    {(e.contacto || e.empresa) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                        {e.contacto && (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <UserRound className="size-3 shrink-0" />
                            {e.contacto.name || e.contacto.phone || 'Contacto'}
                          </span>
                        )}
                        {e.empresa && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Building2 className="size-3 shrink-0" />
                            {e.empresa.name}
                          </span>
                        )}
                      </p>
                    )}

                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {new Date(e.starts_at).toLocaleTimeString('es', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' – '}
                      {new Date(e.ends_at).toLocaleTimeString('es', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {e.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {e.location}
                      </p>
                    )}
                    {e.meeting_url && (
                      <a
                        href={e.meeting_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Video className="size-3" />
                        Entrar a la reunión
                      </a>
                    )}
                    {e.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>
                    )}
                  </div>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await borrar(e.id)) toast.success('Evento eliminado.');
                      }}
                      aria-label="Eliminar evento"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {puedeEditar && (
            <DialogFooter className="bg-popover border-border">
              <Button
                onClick={() => {
                  if (diaElegido) abrirForm(diaElegido);
                  setDiaElegido(null);
                }}
              >
                <Plus className="size-4" />
                Agendar en este día
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Alta */}
      <Dialog open={formAbierto} onOpenChange={(o) => !o && setFormAbierto(false)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Nuevo evento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ev-titulo">Título</Label>
              <Input
                id="ev-titulo"
                autoFocus
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Llamada con Acme"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1.5 sm:col-span-1">
                <Label htmlFor="ev-fecha">Fecha</Label>
                <Input
                  id="ev-fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-desde">Desde</Label>
                <Input
                  id="ev-desde"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => {
                    setHoraInicio(e.target.value);
                    // Si el fin queda antes del inicio, se corre una hora.
                    // Guardar es lo que la base rechazaría; corregirlo acá
                    // evita el rechazo en vez de explicarlo.
                    if (e.target.value >= horaFin) {
                      const [h, m] = e.target.value.split(':').map(Number);
                      setHoraFin(`${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-hasta">Hasta</Label>
                <Input
                  id="ev-hasta"
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-lugar">Lugar</Label>
              <Input
                id="ev-lugar"
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                placeholder="Oficina, o dejalo vacío"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-enlace">Enlace de videollamada</Label>
              <Input
                id="ev-enlace"
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder="https://meet.google.com/…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Notas</Label>
              <Textarea
                id="ev-desc"
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setFormAbierto(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || titulo.trim() === ''}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : 'Agendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
