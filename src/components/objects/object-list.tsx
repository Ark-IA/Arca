'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Settings2, Trash2, Edit3, Eye, EyeOff, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { ObjectDefinition, ViewType } from '@/types/objects';
import * as Icons from 'lucide-react';

interface CustomObjectsListProps {
  objects: ObjectDefinition[];
  onCreateObject: (data: CreateObjectFormData) => Promise<void>;
  onUpdateObject: (id: string, data: UpdateObjectFormData) => Promise<void>;
  onDeleteObject: (id: string) => Promise<void>;
}

export interface CreateObjectFormData {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description: string;
  icon: string;
  defaultView: ViewType;
}

export interface UpdateObjectFormData {
  labelSingular?: string;
  labelPlural?: string;
  description?: string;
  icon?: string;
  defaultView?: ViewType;
  isActive?: boolean;
}

const ICON_OPTIONS = [
  'Folder',
  'FileText',
  'Users',
  'Building2',
  'TrendingUp',
  'CheckSquare',
  'Calendar',
  'Mail',
  'Phone',
  'MessageSquare',
  'ShoppingCart',
  'Package',
  'CreditCard',
  'DollarSign',
  'Briefcase',
  'Target',
  'Flag',
  'Star',
  'Heart',
  'Bookmark',
  'Tag',
  'Layers',
  'Box',
  'Archive',
];

// Solo la tabla: kanban, línea de tiempo y galería no están construidas, y
// elegirlas dejaba el objeto sin forma de ver sus registros.
const VIEW_OPTIONS = [{ value: 'TABLE', label: 'Tabla' }];

// Los objetos de sistema tienen su propia pantalla; los personalizados, la
// de objetos.
const PANTALLA_DE_SISTEMA: Record<string, string> = {
  contacts: '/contacts',
  companies: '/companies',
  deals: '/pipelines',
  tasks: '/tasks',
};

function hrefDe(obj: ObjectDefinition): string {
  return (obj.isSystem && PANTALLA_DE_SISTEMA[obj.id]) || `/objects/${obj.id}`;
}

export function CustomObjectsList({
  objects,
  onCreateObject,
  onUpdateObject,
  onDeleteObject,
}: CustomObjectsListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingObject, setEditingObject] = useState<ObjectDefinition | null>(null);
  const [formData, setFormData] = useState<CreateObjectFormData>({
    nameSingular: '',
    namePlural: '',
    labelSingular: '',
    labelPlural: '',
    description: '',
    icon: 'Folder',
    defaultView: 'TABLE',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingObject) {
      await onUpdateObject(editingObject.id, {
        labelSingular: formData.labelSingular,
        labelPlural: formData.labelPlural,
        description: formData.description,
        icon: formData.icon,
        defaultView: formData.defaultView,
      });
      setEditingObject(null);
    } else {
      await onCreateObject(formData);
    }
    
    setIsCreateOpen(false);
    setFormData({
      nameSingular: '',
      namePlural: '',
      labelSingular: '',
      labelPlural: '',
      description: '',
      icon: 'Folder',
      defaultView: 'TABLE',
    });
  };

  const openEdit = (obj: ObjectDefinition) => {
    setEditingObject(obj);
    setFormData({
      nameSingular: obj.nameSingular,
      namePlural: obj.namePlural,
      labelSingular: obj.labelSingular,
      labelPlural: obj.labelPlural,
      description: obj.description || '',
      icon: obj.icon,
      defaultView: obj.defaultView || 'TABLE',
    });
    setIsCreateOpen(true);
  };

  const IconComponent = (iconName: string) => {
    // El índice de lucide-react no exporta solo iconos: trae helpers y
    // alias, así que el tipo resultante no siempre es un componente. Se
    // acota a lo que acá se usa, que es un icono.
    const Icon = (Icons[iconName as keyof typeof Icons] ??
      Icons.Folder) as React.ComponentType<{ className?: string }>;
    return <Icon className="h-5 w-5" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Objetos Personalizados</h2>
          <p className="text-muted-foreground">
            Crea y gestiona objetos personalizados para tu CRM
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          {/* `render` y no `asChild`: los componentes de este proyecto son
              de Base UI, que compone así. */}
          <DialogTrigger render={<Button onClick={() => setEditingObject(null)} />}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Objeto
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingObject ? 'Editar Objeto' : 'Crear Objeto Personalizado'}
                </DialogTitle>
                <DialogDescription>
                  {editingObject
                    ? 'Modifica la configuración del objeto'
                    : 'Define un nuevo objeto para almacenar datos personalizados'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nameSingular">Nombre Singular (DB)</Label>
                    <Input
                      id="nameSingular"
                      placeholder="ej: deal"
                      value={formData.nameSingular}
                      onChange={(e) =>
                        setFormData({ ...formData, nameSingular: e.target.value })
                      }
                      disabled={!!editingObject}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="namePlural">Nombre Plural (DB)</Label>
                    <Input
                      id="namePlural"
                      placeholder="ej: deals"
                      value={formData.namePlural}
                      onChange={(e) =>
                        setFormData({ ...formData, namePlural: e.target.value })
                      }
                      disabled={!!editingObject}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="labelSingular">Label Singular</Label>
                    <Input
                      id="labelSingular"
                      placeholder="ej: Oportunidad"
                      value={formData.labelSingular}
                      onChange={(e) =>
                        setFormData({ ...formData, labelSingular: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labelPlural">Label Plural</Label>
                    <Input
                      id="labelPlural"
                      placeholder="ej: Oportunidades"
                      value={formData.labelPlural}
                      onChange={(e) =>
                        setFormData({ ...formData, labelPlural: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    placeholder="Descripción del objeto..."
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="icon">Ícono</Label>
                    <Select
                      value={formData.icon}
                      onValueChange={(value) =>
                        // El Select de Base UI puede emitir null al
                        // deseleccionar; el ícono siempre tiene que tener uno.
                        setFormData({ ...formData, icon: value ?? formData.icon })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((icon) => (
                          <SelectItem key={icon} value={icon}>
                            <div className="flex items-center gap-2">
                              {IconComponent(icon)}
                              {icon}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultView">Vista por Defecto</Label>
                    <Select
                      value={formData.defaultView}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          defaultView: value as ViewType,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIEW_OPTIONS.map((view) => (
                          <SelectItem key={view.value} value={view.value}>
                            {view.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingObject ? 'Guardar Cambios' : 'Crear Objeto'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {objects.map((obj) => (
          <Card key={obj.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    {IconComponent(obj.icon)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">
                      <Link href={hrefDe(obj)} className="hover:underline">
                        {obj.labelPlural}
                      </Link>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {obj.namePlural}
                    </CardDescription>
                  </div>
                </div>
                {!obj.isSystem && (
                  <Badge variant={obj.isActive ? 'default' : 'secondary'}>
                    {obj.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {obj.description || 'Sin descripción'}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                <Badge variant="outline" className="gap-1">
                  <Database className="h-3 w-3" />
                  {obj.fields?.length || 0} campos
                </Badge>
              </div>
              {!obj.isSystem && (
                <div className="flex gap-2">
                  <Link
                    href={hrefDe(obj)}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Database className="h-3 w-3" />
                    Abrir
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(obj)}
                  >
                    <Edit3 className="h-3 w-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      onUpdateObject(obj.id, { isActive: !obj.isActive })
                    }
                  >
                    {obj.isActive ? (
                      <EyeOff className="h-3 w-3 mr-1" />
                    ) : (
                      <Eye className="h-3 w-3 mr-1" />
                    )}
                    {obj.isActive ? 'Ocultar' : 'Mostrar'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDeleteObject(obj.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {obj.isSystem && (
                <Badge variant="secondary" className="text-xs">
                  <Settings2 className="h-3 w-3 mr-1" />
                  Sistema
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}

        {objects.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No hay objetos personalizados</h3>
            <p className="text-muted-foreground mb-4">
              Crea tu primer objeto para comenzar
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Objeto
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
