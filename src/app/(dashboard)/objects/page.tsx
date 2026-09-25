'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomObjectsList } from '@/components/objects/object-list';
import type { ObjectDefinition } from '@/types/objects';
import { toast } from 'sonner';
import { createCustomObjectsManager } from '@/lib/objects/manager';
import type { UpdateObjectInput } from '@/lib/objects/manager';
import type { CreateObjectFormData } from '@/components/objects/object-list';

export default function ObjectsPage() {
  const [objects, setObjects] = useState<ObjectDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const [manager, setManager] = useState<ReturnType<typeof createCustomObjectsManager> | null>(null);

  useEffect(() => {
    async function loadObjects() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('account_id')
          .eq('user_id', user.id)
          .single();

        if (!profile) return;

        const mgr = createCustomObjectsManager(supabase, profile.account_id);
        setManager(mgr);

        const objs = await mgr.getObjects();
        setObjects(objs);
      } catch (error) {
        console.error('Error loading objects:', error);
        toast.error('Error al cargar objetos');
      } finally {
        setLoading(false);
      }
    }

    loadObjects();
  }, [supabase]);

  const handleCreateObject = async (data: CreateObjectFormData) => {
    if (!manager) return;

    const result = await manager.createObject({
      nameSingular: data.nameSingular,
      namePlural: data.namePlural,
      labelSingular: data.labelSingular,
      labelPlural: data.labelPlural,
      description: data.description,
      icon: data.icon,
      primaryFieldId: 'name',
      defaultView: data.defaultView,
      fields: [
        {
          name: 'name',
          label: 'Nombre',
          type: 'TEXT',
          required: true,
          visibleInList: true,
          position: 0,
        },
      ],
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Objeto creado exitosamente');
      if (result.object) {
        setObjects([...objects, result.object]);
      }
    }
  };

  const handleUpdateObject = async (id: string, data: UpdateObjectInput) => {
    if (!manager) return;

    const result = await manager.updateObject(id, data);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Objeto actualizado');
      // Sólo los metadatos. `data.fields` viene con forma de ENTRADA
      // (`CreateFieldInput`, sin id ni etiquetas derivadas) y esta
      // lista guarda definiciones completas; volcarlo entero dejaba en
      // memoria campos a medio construir que la tabla luego intenta
      // pintar. Los campos no se editan desde este diálogo de todos
      // modos — eso vive en la pantalla de detalle.
      const { fields: _campos, ...metadatos } = data;
      setObjects(objects.map(obj =>
        obj.id === id ? { ...obj, ...metadatos } : obj
      ));
    }
  };

  const handleDeleteObject = async (id: string) => {
    if (!manager) return;

    if (!confirm('¿Estás seguro de eliminar este objeto? Esta acción no se puede deshacer.')) {
      return;
    }

    const result = await manager.deleteObject(id);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Objeto eliminado');
      setObjects(objects.filter(obj => obj.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <CustomObjectsList
        objects={objects}
        onCreateObject={handleCreateObject}
        onUpdateObject={handleUpdateObject}
        onDeleteObject={handleDeleteObject}
      />
    </div>
  );
}
