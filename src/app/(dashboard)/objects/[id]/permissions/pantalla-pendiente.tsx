'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createCustomObjectsManager } from '@/lib/objects/manager';
import {
  type ObjectPermission,
  type PermissionScope,
  type Role,
  createPermissionManager,
} from '@/lib/objects/permissions';
import type { ObjectDefinition } from '@/types/objects';

/**
 * Quién puede hacer qué con un objeto.
 *
 * Son dos preguntas por acción: si puede (`canRead`, `canCreate`…) y sobre
 * cuáles (`ALL` todos, `OWN` los suyos, `NONE` ninguno). El RLS de la base
 * garantiza el aislamiento por cuenta y el piso de rol; este detalle fino
 * lo resuelve la aplicación, que es donde está escrito.
 */

const ROLES: { valor: Role; titulo: string; detalle: string }[] = [
  { valor: 'owner', titulo: 'Dueño', detalle: 'Control total de la cuenta' },
  { valor: 'admin', titulo: 'Administrador', detalle: 'Configura y gestiona' },
  { valor: 'agent', titulo: 'Agente', detalle: 'Opera el día a día' },
  { valor: 'viewer', titulo: 'Observador', detalle: 'Solo mira' },
];

const ALCANCES: { valor: PermissionScope; texto: string }[] = [
  { valor: 'ALL', texto: 'Todos' },
  { valor: 'OWN', texto: 'Solo los suyos' },
  { valor: 'NONE', texto: 'Ninguno' },
];

const ACCIONES = [
  { puede: 'canRead', alcance: 'readScope', titulo: 'Ver' },
  { puede: 'canCreate', alcance: 'createScope', titulo: 'Crear' },
  { puede: 'canUpdate', alcance: 'updateScope', titulo: 'Editar' },
  { puede: 'canDelete', alcance: 'deleteScope', titulo: 'Borrar' },
] as const;

export default function PermisosPage() {
  const params = useParams();
  const objectId = params.id as string;

  const supabase = createClient();
  const { profile, profileLoading } = useAuth();
  const accountId = profile?.account_id ?? null;
  const esAdmin =
    profile?.account_role === 'owner' || profile?.account_role === 'admin';

  const [objeto, setObjeto] = useState<ObjectDefinition | null>(null);
  const [permisos, setPermisos] = useState<ObjectPermission[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<Role | null>(null);

  const traer = useCallback(async () => {
    if (!accountId) return;

    const objetos = createCustomObjectsManager(supabase, accountId);
    const permisosMgr = createPermissionManager(supabase, accountId);

    const ficha = await objetos.getObject(objectId);
    if (ficha.error) {
      toast.error(ficha.error);
      setCargando(false);
      return;
    }
    setObjeto(ficha.object);

    let filas = await permisosMgr.getObjectPermissions(objectId);

    // Un objeto creado antes de que existiera esta pantalla puede no tener
    // sus filas: se siembran con los valores por defecto y se relee.
    if (filas.length === 0) {
      const { error } =
        await permisosMgr.initializeDefaultPermissions(objectId);
      if (error) toast.error(error);
      else filas = await permisosMgr.getObjectPermissions(objectId);
    }

    setPermisos(filas);
    setCargando(false);
  }, [supabase, accountId, objectId]);

  useEffect(() => {
    if (profileLoading) return;
    void traer();
  }, [profileLoading, traer]);

  const guardar = async (permiso: ObjectPermission) => {
    if (!accountId) return;
    setGuardando(permiso.role);
    try {
      const mgr = createPermissionManager(supabase, accountId);
      const { error } = await mgr.updatePermissions(objectId, permiso.role, {
        role: permiso.role,
        canRead: permiso.canRead,
        canCreate: permiso.canCreate,
        canUpdate: permiso.canUpdate,
        canDelete: permiso.canDelete,
        readScope: permiso.readScope,
        createScope: permiso.createScope,
        updateScope: permiso.updateScope,
        deleteScope: permiso.deleteScope,
      });
      if (error) toast.error(error);
      else toast.success('Permisos guardados');
    } finally {
      setGuardando(null);
    }
  };

  /** Cambia un permiso en memoria; se persiste con el botón Guardar. */
  const editar = (rol: Role, cambios: Partial<ObjectPermission>) => {
    setPermisos((lista) =>
      lista.map((p) => (p.role === rol ? { ...p, ...cambios } : p))
    );
  };

  if (profileLoading || cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="border-primary size-8 animate-spin rounded-full border-b-2" />
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
          <h1 className="text-3xl font-bold tracking-tight">Permisos</h1>
          <p className="text-muted-foreground">
            Quién puede hacer qué con {objeto?.labelPlural ?? 'este objeto'}
          </p>
        </div>
      </div>

      {!esAdmin && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Solo dueños y administradores pueden cambiar permisos. Podés mirarlos.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {ROLES.map(({ valor, titulo, detalle }) => {
          const permiso = permisos.find((p) => p.role === valor);
          if (!permiso) return null;

          return (
            <Card key={valor}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-baseline gap-2 text-base">
                  {titulo}
                  <span className="text-muted-foreground text-xs font-normal">
                    {detalle}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ACCIONES.map(({ puede, alcance, titulo: accion }) => (
                  <div key={puede} className="flex items-center gap-3">
                    <Checkbox
                      id={`${valor}-${puede}`}
                      checked={Boolean(permiso[puede])}
                      disabled={!esAdmin}
                      onCheckedChange={(v) =>
                        editar(valor, {
                          [puede]: Boolean(v),
                        } as Partial<ObjectPermission>)
                      }
                    />
                    <Label
                      htmlFor={`${valor}-${puede}`}
                      className="w-16 cursor-pointer text-sm"
                    >
                      {accion}
                    </Label>
                    <Select
                      value={permiso[alcance]}
                      disabled={!esAdmin || !permiso[puede]}
                      onValueChange={(v) =>
                        editar(valor, {
                          [alcance]: (v as PermissionScope) ?? permiso[alcance],
                        } as Partial<ObjectPermission>)
                      }
                    >
                      <SelectTrigger className="h-8 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALCANCES.map((a) => (
                          <SelectItem key={a.valor} value={a.valor}>
                            {a.texto}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                {esAdmin && (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={guardando === valor}
                    onClick={() => guardar(permiso)}
                  >
                    {guardando === valor ? 'Guardando…' : 'Guardar'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
