'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { DynamicTableView } from '@/components/objects/dynamic-table';
import { createCustomObjectsManager } from '@/lib/objects/manager';
import { createCustomRecordsManager } from '@/lib/objects/records';
import type { FieldDefinition, ObjectDefinition, ObjectRecord } from '@/types/objects';

/**
 * Los datos de un objeto personalizado.
 *
 * La ficha del objeto define la forma —qué campos tiene—; acá se cargan
 * las filas. La tabla la dibuja DynamicTableView, que ya existía y hasta
 * ahora no la usaba nadie.
 */
export default function RegistrosPage() {
  const params = useParams();
  const objectId = params.id as string;

  const supabase = createClient();
  const { user, profile, profileLoading } = useAuth();
  const accountId = profile?.account_id ?? null;

  const [objeto, setObjeto] = useState<ObjectDefinition | null>(null);
  const [registros, setRegistros] = useState<ObjectRecord[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrador, setBorrador] = useState<Record<string, unknown>>({});

  const traer = useCallback(async () => {
    if (!accountId || !user) return;

    const objetos = createCustomObjectsManager(supabase, accountId);
    const registrosMgr = createCustomRecordsManager(supabase, accountId, user.id);

    // La ficha va primero y no en paralelo: la búsqueda necesita saber por
    // qué campo buscar, y ese es el principal del objeto, que sale de acá.
    const ficha = await objetos.getObject(objectId);
    if (ficha.error) {
      toast.error(ficha.error);
      setCargando(false);
      return;
    }
    setObjeto(ficha.object);

    const campoDeBusqueda =
      ficha.object?.primaryFieldId ?? ficha.object?.fields?.[0]?.name;

    const datos = await registrosMgr.queryRecords(objectId, {
      searchFieldId: busqueda ? campoDeBusqueda : undefined,
      searchQuery: busqueda || undefined,
      limit: 200,
    });

    if (datos.error) toast.error(datos.error);
    else setRegistros(datos.records);

    setCargando(false);
  }, [supabase, accountId, user, objectId, busqueda]);

  useEffect(() => {
    if (profileLoading) return;
    void traer();
  }, [profileLoading, traer]);

  const campos = objeto?.fields ?? [];

  const abrirNuevo = () => {
    // El borrador arranca con los valores por defecto de cada campo, que
    // es lo que el usuario esperaría ver ya puesto.
    const inicial: Record<string, unknown> = {};
    for (const c of campos) {
      if (c.defaultValue !== undefined && c.defaultValue !== null) {
        inicial[c.name] = c.defaultValue;
      } else if (c.type === 'BOOLEAN') {
        inicial[c.name] = false;
      }
    }
    setBorrador(inicial);
    setAbierto(true);
  };

  const guardar = async () => {
    if (!accountId || !user) return;

    const faltantes = campos.filter(
      (c) => c.required && (borrador[c.name] === undefined || borrador[c.name] === ''),
    );
    if (faltantes.length > 0) {
      toast.error(`Falta completar: ${faltantes.map((c) => c.label).join(', ')}`);
      return;
    }

    setGuardando(true);
    try {
      const mgr = createCustomRecordsManager(supabase, accountId, user.id);
      const { error } = await mgr.createRecord({ objectId, fields: borrador });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${objeto?.labelSingular ?? 'Registro'} creado`);
      setAbierto(false);
      await traer();
    } finally {
      setGuardando(false);
    }
  };

  if (profileLoading || cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/objects/${objectId}`}
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            {objeto?.labelPlural ?? 'Registros'}
          </h1>
          <p className="text-muted-foreground">
            {registros.length} registro{registros.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <DynamicTableView
        fields={campos}
        records={registros}
        view={objeto?.defaultView}
        loading={cargando}
        onNewRecord={abrirNuevo}
        onSearch={setBusqueda}
      />

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Nuevo {objeto?.labelSingular ?? 'registro'}</DialogTitle>
            <DialogDescription>
              Completá los campos definidos para este objeto.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-4 overflow-auto py-2">
            {campos.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Este objeto todavía no tiene campos. Agregalos desde la pestaña
                Campos.
              </p>
            )}
            {campos.map((campo) => (
              <CampoDeFormulario
                key={campo.id || campo.name}
                campo={campo}
                valor={borrador[campo.name]}
                onCambio={(v) => setBorrador((b) => ({ ...b, [campo.name]: v }))}
              />
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || campos.length === 0}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Un campo del formulario, según su tipo.
 *
 * No están los dieciocho tipos: los que faltan caen en un input de texto,
 * que guarda igual. Es preferible a bloquear la carga de un registro
 * porque su objeto usa un tipo que todavía no tiene control propio.
 */
function CampoDeFormulario({
  campo,
  valor,
  onCambio,
}: {
  campo: FieldDefinition;
  valor: unknown;
  onCambio: (v: unknown) => void;
}) {
  const id = `campo-${campo.name}`;
  const etiqueta = (
    <Label htmlFor={id}>
      {campo.label}
      {campo.required && <span className="ml-1 text-destructive">*</span>}
    </Label>
  );

  if (campo.type === 'BOOLEAN') {
    return (
      <div className="flex items-center justify-between gap-3">
        {etiqueta}
        <Switch
          id={id}
          checked={Boolean(valor)}
          onCheckedChange={(v) => onCambio(Boolean(v))}
        />
      </div>
    );
  }

  if (campo.type === 'TEXT_AREA') {
    return (
      <div className="space-y-2">
        {etiqueta}
        <Textarea
          id={id}
          value={(valor as string) ?? ''}
          onChange={(e) => onCambio(e.target.value)}
        />
      </div>
    );
  }

  const tipoHtml =
    campo.type === 'NUMBER' || campo.type === 'CURRENCY'
      ? 'number'
      : campo.type === 'DATE'
        ? 'date'
        : campo.type === 'DATE_TIME'
          ? 'datetime-local'
          : campo.type === 'EMAIL'
            ? 'email'
            : campo.type === 'PHONE'
              ? 'tel'
              : campo.type === 'URL'
                ? 'url'
                : 'text';

  return (
    <div className="space-y-2">
      {etiqueta}
      <Input
        id={id}
        type={tipoHtml}
        value={(valor as string) ?? ''}
        onChange={(e) =>
          onCambio(
            tipoHtml === 'number'
              ? e.target.value === ''
                ? ''
                : Number(e.target.value)
              : e.target.value,
          )
        }
      />
      {campo.description && (
        <p className="text-muted-foreground text-xs">{campo.description}</p>
      )}
    </div>
  );
}
