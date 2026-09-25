'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutBuilder, type LayoutConfig } from '@/components/layout-builder';
import { createCustomObjectsManager } from '@/lib/objects/manager';
import type {
  ObjectDefinition,
  ViewDefinition,
  ViewType,
} from '@/types/objects';

/**
 * Cómo se ve un objeto.
 *
 * Dos cosas distintas que suelen confundirse:
 *
 *   Vistas — cómo se lista: tabla, kanban, línea de tiempo, galería.
 *   Ficha  — cómo se ordenan los campos al abrir un registro.
 *
 * La primera vive en `custom_views`, la segunda en `custom_layouts`.
 */

const TIPOS: { valor: ViewType; texto: string }[] = [
  { valor: 'TABLE', texto: 'Tabla' },
  { valor: 'KANBAN', texto: 'Kanban' },
  { valor: 'TIMELINE', texto: 'Línea de tiempo' },
  { valor: 'GALLERY', texto: 'Galería' },
  { valor: 'CALENDAR', texto: 'Calendario' },
];

export default function VistasPage() {
  const params = useParams();
  const objectId = params.id as string;

  const supabase = createClient();
  const { user, profile, profileLoading } = useAuth();
  const accountId = profile?.account_id ?? null;

  const [objeto, setObjeto] = useState<ObjectDefinition | null>(null);
  const [vistas, setVistas] = useState<ViewDefinition[]>([]);
  const [ficha, setFicha] = useState<LayoutConfig | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<ViewType>('TABLE');

  const traer = useCallback(async () => {
    if (!accountId) return;

    const objetos = createCustomObjectsManager(supabase, accountId);

    const resultado = await objetos.getObject(objectId);
    if (resultado.error) {
      toast.error(resultado.error);
      setCargando(false);
      return;
    }
    setObjeto(resultado.object);

    try {
      setVistas(await objetos.getViews(objectId));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'No se pudieron cargar las vistas'
      );
    }

    // La ficha guardada, si la hay. Es una sola por objeto: la marcada por
    // defecto. Sin ella se arranca de cero con todos los campos sueltos.
    const { data: guardada } = await supabase
      .from('custom_layouts')
      .select('config')
      .eq('object_id', objectId)
      .eq('account_id', accountId)
      .eq('is_default', true)
      .maybeSingle();

    const campos = resultado.object?.fields ?? [];
    const config = (guardada?.config ?? null) as LayoutConfig | null;

    setFicha({
      sections: config?.sections ?? [],
      // Los disponibles se recalculan siempre contra los campos de hoy: si
      // se agregó uno después de guardar la ficha, tiene que aparecer.
      availableFields: campos.filter(
        (c) => !(config?.sections ?? []).some((s) => s.fields.includes(c.id))
      ),
    });

    setCargando(false);
  }, [supabase, accountId, objectId]);

  useEffect(() => {
    if (profileLoading) return;
    void traer();
  }, [profileLoading, traer]);

  const crearVista = async () => {
    if (!accountId || !nombre.trim()) {
      toast.error('Poné un nombre para la vista.');
      return;
    }
    setGuardando(true);
    try {
      const objetos = createCustomObjectsManager(supabase, accountId);
      const { error } = await objetos.createView(objectId, {
        name: nombre.trim(),
        type: tipo,
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Vista creada');
      setAbierto(false);
      setNombre('');
      setTipo('TABLE');
      await traer();
    } finally {
      setGuardando(false);
    }
  };

  const guardarFicha = async (config: LayoutConfig) => {
    if (!accountId || !user) return;
    // Solo se guardan las secciones: los campos disponibles se derivan de
    // la definición del objeto y cambiarían solos al agregar uno nuevo.
    const { error } = await supabase.from('custom_layouts').upsert(
      {
        account_id: accountId,
        object_id: objectId,
        name: 'Ficha principal',
        config: { sections: config.sections },
        is_default: true,
        created_by: user.id,
      },
      { onConflict: 'object_id,name' }
    );

    if (error) toast.error(error.message);
    else toast.success('Ficha guardada');
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
          <h1 className="text-3xl font-bold tracking-tight">Vistas</h1>
          <p className="text-muted-foreground">
            Cómo se ve {objeto?.labelPlural ?? 'este objeto'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="listados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="listados">Listados</TabsTrigger>
          <TabsTrigger value="ficha">Ficha del registro</TabsTrigger>
        </TabsList>

        <TabsContent value="listados" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAbierto(true)}>
              <Plus className="size-4" />
              Nueva vista
            </Button>
          </div>

          {vistas.length === 0 ? (
            <div className="border-border rounded-lg border border-dashed py-12 text-center">
              <p className="text-muted-foreground text-sm">
                Todavía no hay vistas guardadas.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {vistas.map((v) => (
                <Card key={v.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {v.isDefault && (
                        <Star className="text-primary size-3.5" />
                      )}
                      {v.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline">
                      {TIPOS.find((t) => t.valor === v.type)?.texto ?? v.type}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ficha">
          {ficha && (
            <LayoutBuilder
              initialLayout={ficha}
              onSave={guardarFicha}
              onCancel={() => void traer()}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nueva vista</DialogTitle>
            <DialogDescription>
              Una forma guardada de listar{' '}
              {objeto?.labelPlural ?? 'los registros'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: Activos este mes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo((v as ViewType) ?? tipo)}
              >
                <SelectTrigger id="tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.texto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAbierto(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button onClick={crearVista} disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
