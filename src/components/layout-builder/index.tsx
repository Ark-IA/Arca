'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Plus, Settings2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import type { FieldDefinition } from '@/types/objects';

export interface LayoutSection {
  id: string;
  title: string;
  columns: number; // 1-4
  fields: string[]; // Field IDs
  collapsed: boolean;
  visible: boolean;
}

export interface LayoutConfig {
  sections: LayoutSection[];
  availableFields: FieldDefinition[];
}

interface SortableFieldItemProps {
  field: FieldDefinition;
  onRemove: () => void;
}

function SortableFieldItem({ field, onRemove }: SortableFieldItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 bg-card border rounded-md cursor-grab active:cursor-grabbing hover:bg-accent/50"
    >
      <GripVertical {...listeners} className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{field.label}</p>
        <p className="text-xs text-muted-foreground">{field.name}</p>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface SortableSectionProps {
  section: LayoutSection;
  fields: FieldDefinition[];
  onUpdate: (updates: Partial<LayoutSection>) => void;
  onRemove: () => void;
  onAddField: (fieldId: string) => void;
  onRemoveField: (fieldId: string) => void;
  allFields: FieldDefinition[];
}

function SortableSection({
  section,
  fields,
  onUpdate,
  onRemove,
  onAddField,
  onRemoveField,
  allFields,
}: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const availableFields = allFields.filter(f => !fields.find(existing => existing.id === f.id));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg bg-card ${section.visible ? '' : 'opacity-50'}`}
    >
      <div className="flex items-center gap-2 p-3 border-b">
        <GripVertical {...listeners} className="h-4 w-4 text-muted-foreground cursor-grab" />
        <Input
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="h-8 flex-1"
          placeholder="Título de la sección"
        />
        <Select
          value={String(section.columns)}
          onValueChange={(v) => onUpdate({ columns: Number(v) })}
        >
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 Col</SelectItem>
            <SelectItem value="2">2 Col</SelectItem>
            <SelectItem value="3">3 Col</SelectItem>
            <SelectItem value="4">4 Col</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onUpdate({ collapsed: !section.collapsed })}
        >
          {section.collapsed ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onUpdate({ visible: !section.visible })}
        >
          {section.visible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!section.collapsed && (
        <CardContent className="p-3 space-y-3">
          {section.columns === 1 ? (
            <div className="space-y-2">
              <SortableContext items={section.fields} strategy={verticalListSortingStrategy}>
                {fields.map((field) => (
                  <SortableFieldItem
                    key={field.id}
                    field={field}
                    onRemove={() => onRemoveField(field.id)}
                  />
                ))}
              </SortableContext>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${section.columns}, 1fr)` }}>
              {fields.map((field) => (
                <SortableFieldItem
                  key={field.id}
                  field={field}
                  onRemove={() => onRemoveField(field.id)}
                />
              ))}
            </div>
          )}

          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Arrastra campos aquí o selecciónalos abajo
            </p>
          )}

          {availableFields.length > 0 && (
            <div className="pt-3 border-t">
              <Label className="text-xs mb-2">Añadir campo</Label>
              {/* Base UI emite null al deseleccionar: sin campo no hay
                  nada que añadir. El tipo va explícito porque sin `value`
                  el Select no tiene de dónde inferirlo. */}
              <Select
                onValueChange={(fieldId: string | null) =>
                  fieldId && onAddField(fieldId)
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Seleccionar campo..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.label} ({field.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      )}
    </div>
  );
}

interface LayoutBuilderProps {
  initialLayout?: LayoutConfig;
  onSave: (layout: LayoutConfig) => void;
  onCancel: () => void;
}

export function LayoutBuilder({ initialLayout, onSave, onCancel }: LayoutBuilderProps) {
  const [layout, setLayout] = useState<LayoutConfig>(
    initialLayout || { sections: [], availableFields: [] }
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'section') {
      setActiveSectionId(event.active.id as string);
    } else if (event.active.data.current?.type === 'field') {
      setActiveFieldId(event.active.id as string);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSectionId(null);
    setActiveFieldId(null);

    if (!over) return;

    // Mover sección
    if (active.data.current?.type === 'section') {
      const oldIndex = layout.sections.findIndex((s) => s.id === active.id);
      const newIndex = layout.sections.findIndex((s) => s.id === over.id);

      if (oldIndex !== newIndex) {
        setLayout({
          ...layout,
          sections: arrayMove(layout.sections, oldIndex, newIndex),
        });
      }
    }

    // Mover campo entre secciones
    if (active.data.current?.type === 'field') {
      const activeSection = layout.sections.find((s) =>
        s.fields.includes(active.id as string)
      );
      const overSection = layout.sections.find((s) =>
        s.fields.includes(over.id as string) || s.id === over.id
      );

      if (activeSection && overSection) {
        // Remover de sección original
        const newActiveFields = activeSection.fields.filter((f) => f !== active.id);

        // Encontrar índice para insertar
        const overFieldIndex = overSection.fields.findIndex((f) => f === over.id);
        const newOverFields = [...overSection.fields];

        if (overFieldIndex >= 0) {
          newOverFields.splice(overFieldIndex, 0, active.id as string);
        } else {
          newOverFields.push(active.id as string);
        }

        setLayout({
          ...layout,
          sections: layout.sections.map((s) => {
            if (s.id === activeSection.id) {
              return { ...s, fields: newActiveFields };
            }
            if (s.id === overSection.id) {
              return { ...s, fields: newOverFields };
            }
            return s;
          }),
        });
      }
    }
  };

  const addSection = () => {
    const newSection: LayoutSection = {
      id: `section_${Date.now()}`,
      title: 'Nueva Sección',
      columns: 1,
      fields: [],
      collapsed: false,
      visible: true,
    };
    setLayout({
      ...layout,
      sections: [...layout.sections, newSection],
    });
  };

  const updateSection = (sectionId: string, updates: Partial<LayoutSection>) => {
    setLayout({
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === sectionId ? { ...s, ...updates } : s
      ),
    });
  };

  const removeSection = (sectionId: string) => {
    setLayout({
      ...layout,
      sections: layout.sections.filter((s) => s.id !== sectionId),
    });
  };

  const addFieldToSection = (sectionId: string, fieldId: string) => {
    setLayout({
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === sectionId && !s.fields.includes(fieldId)
          ? { ...s, fields: [...s.fields, fieldId] }
          : s
      ),
    });
  };

  const removeFieldFromSection = (sectionId: string, fieldId: string) => {
    setLayout({
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.filter((f) => f !== fieldId) }
          : s
      ),
    });
  };

  const getFieldById = (fieldId: string): FieldDefinition | undefined => {
    return layout.availableFields.find((f) => f.id === fieldId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Editor de Layout</h2>
          <p className="text-muted-foreground">
            Organiza los campos en secciones personalizables
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(layout)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Guardar Layout
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {/* Panel de secciones */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Secciones</h3>
              <Button size="sm" onClick={addSection}>
                <Plus className="mr-2 h-4 w-4" />
                Añadir Sección
              </Button>
            </div>

            <SortableContext
              items={layout.sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {layout.sections.map((section) => {
                  const sectionFields = section.fields
                    .map((fieldId) => getFieldById(fieldId))
                    .filter((f): f is FieldDefinition => !!f);

                  return (
                    <SortableSection
                      key={section.id}
                      section={section}
                      fields={sectionFields}
                      allFields={layout.availableFields}
                      onUpdate={(updates) => updateSection(section.id, updates)}
                      onRemove={() => removeSection(section.id)}
                      onAddField={(fieldId) => addFieldToSection(section.id, fieldId)}
                      onRemoveField={(fieldId) => removeFieldFromSection(section.id, fieldId)}
                    />
                  );
                })}
              </div>
            </SortableContext>

            {layout.sections.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No hay secciones</h3>
                <p className="text-muted-foreground mb-4">
                  Añade tu primera sección para comenzar
                </p>
                <Button onClick={addSection}>
                  <Plus className="mr-2 h-4 w-4" />
                  Añadir Sección
                </Button>
              </div>
            )}
          </div>

          {/* Panel de campos disponibles */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold">Campos Disponibles</h3>
                <div className="space-y-2">
                  {layout.availableFields.map((field) => {
                    const isUsed = layout.sections.some((s) =>
                      s.fields.includes(field.id)
                    );
                    return (
                      <div
                        key={field.id}
                        className={`p-2 border rounded-md cursor-grab ${
                          isUsed ? 'opacity-50 bg-muted' : 'hover:bg-accent/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{field.label}</p>
                            <p className="text-xs text-muted-foreground">{field.name}</p>
                          </div>
                          {isUsed && <Badge variant="secondary" className="text-xs">En uso</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">Consejos</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Arrastra secciones para reordenar</li>
                  <li>• Arrastra campos entre secciones</li>
                  <li>• Usa 1-4 columnas por sección</li>
                  <li>• Colapsa secciones para ahorrar espacio</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </DndContext>
    </div>
  );
}

// Componente para visualizar un layout guardado
interface LayoutViewerProps {
  layout: LayoutConfig;
  fieldValues: Record<string, any>;
  onFieldClick?: (fieldId: string) => void;
}

export function LayoutViewer({ layout, fieldValues, onFieldClick }: LayoutViewerProps) {
  return (
    <div className="space-y-6">
      {layout.sections
        .filter((section) => section.visible)
        .map((section) => {
          const sectionFields = section.fields
            .map((fieldId) => layout.availableFields.find((f) => f.id === fieldId))
            .filter((f): f is FieldDefinition => !!f);

          return (
            <Card key={section.id}>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4">{section.title}</h3>
                <div
                  className="grid gap-4"
                  style={{ gridTemplateColumns: `repeat(${section.columns}, 1fr)` }}
                >
                  {sectionFields.map((field) => (
                    <div
                      key={field.id}
                      className="space-y-1 cursor-pointer hover:bg-accent/50 p-2 rounded"
                      onClick={() => onFieldClick?.(field.id)}
                    >
                      <Label className="text-xs text-muted-foreground">
                        {field.label}
                      </Label>
                      <div className="font-medium">
                        {fieldValues[field.name] || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
