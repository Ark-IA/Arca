'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import { ArrowLeft, Database, Settings, List } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FieldEditor } from '@/components/objects/field-editor';
import { toast } from 'sonner';
import { createCustomObjectsManager } from '@/lib/objects/manager';
import type { ObjectDefinition, FieldDefinition } from '@/types/objects';

export default function ObjectDetailPage() {
  const params = useParams();
  const objectId = params.id as string;
  const [object, setObject] = useState<ObjectDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadObject() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('account_id')
          .eq('user_id', user.id)
          .single();

        if (!profile) return;

        const manager = createCustomObjectsManager(supabase, profile.account_id);
        const result = await manager.getObject(objectId);

        if (result.error) {
          toast.error(result.error);
        } else if (result.object) {
          setObject(result.object);
        }
      } catch (error) {
        console.error('Error loading object:', error);
        toast.error('Error al cargar el objeto');
      } finally {
        setLoading(false);
      }
    }

    loadObject();
  }, [objectId, supabase]);

  const handleAddField = async (field: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const manager = createCustomObjectsManager(supabase, profile.account_id);
      const result = await manager.addField(objectId, field);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Campo añadido');
        if (object && result.field) {
          setObject({
            ...object,
            fields: [...(object.fields || []), result.field],
          });
        }
      }
    } catch (error) {
      toast.error('Error al añadir campo');
    }
  };

  const handleUpdateField = async (fieldId: string, updates: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const manager = createCustomObjectsManager(supabase, profile.account_id);
      const result = await manager.updateField(fieldId, updates);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Campo actualizado');
        if (object) {
          setObject({
            ...object,
            fields: object.fields.map(f =>
              f.id === fieldId ? { ...f, ...updates } : f
            ),
          });
        }
      }
    } catch (error) {
      toast.error('Error al actualizar campo');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('¿Eliminar este campo? Los datos de este campo se perderán.')) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const manager = createCustomObjectsManager(supabase, profile.account_id);
      const result = await manager.deleteField(fieldId);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Campo eliminado');
        if (object) {
          setObject({
            ...object,
            fields: object.fields.filter(f => f.id !== fieldId),
          });
        }
      }
    } catch (error) {
      toast.error('Error al eliminar campo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!object) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Objeto no encontrado</h2>
          <p className="text-muted-foreground mt-2">
            El objeto que buscas no existe o fue eliminado.
          </p>
          {/* El Button de este proyecto es el de Base UI y no tiene el
              `asChild` de Radix. Se estiliza el Link con buttonVariants,
              que además conserva el "abrir en pestaña nueva". */}
          <Link href="/objects" className={buttonVariants({ className: 'mt-4' })}>
            Volver a objetos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/objects"
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{object.labelPlural}</h1>
          <p className="text-muted-foreground">{object.description}</p>
        </div>
      </div>

      <Tabs defaultValue="fields" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fields" className="gap-2">
            <Settings className="h-4 w-4" />
            Campos
          </TabsTrigger>
          <TabsTrigger value="records" className="gap-2">
            <List className="h-4 w-4" />
            Registros
          </TabsTrigger>
          <TabsTrigger value="views" className="gap-2">
            <Database className="h-4 w-4" />
            Vistas
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            Permisos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <FieldEditor
            fields={object.fields || []}
            onAddField={handleAddField}
            onUpdateField={handleUpdateField}
            onDeleteField={handleDeleteField}
          />
        </TabsContent>

        <TabsContent value="records">
          <div className="text-center py-12">
            <List className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Registros</h3>
            <p className="text-muted-foreground mb-4">
              Los datos cargados para {object.labelSingular.toLowerCase()}: listarlos,
              buscarlos y cargar nuevos
            </p>
            <Link
              href={`/objects/${objectId}/records`}
              className={buttonVariants()}
            >
              Ver Registros
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="views">
          <div className="text-center py-12">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Vistas</h3>
            <p className="text-muted-foreground mb-4">
              Cómo se listan los registros —tabla, kanban, línea de tiempo,
              galería— y cómo se ordenan los campos en la ficha
            </p>
            <Link
              href={`/objects/${objectId}/views`}
              className={buttonVariants()}
            >
              Gestionar Vistas
            </Link>
          </div>
        </TabsContent>

        <TabsContent value="permissions">
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">Permisos</h3>
            <p className="text-muted-foreground mb-4">
              Qué puede hacer cada rol —ver, crear, editar, borrar— y sobre
              cuáles registros
            </p>
            <Link
              href={`/objects/${objectId}/permissions`}
              className={buttonVariants()}
            >
              Configurar Permisos
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
