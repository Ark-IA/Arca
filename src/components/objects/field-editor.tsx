'use client';

import { useState } from 'react';
import { Plus, GripVertical, Trash2, Edit3, Save, X, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { FieldDefinition, FieldType } from '@/types/objects';

interface FieldEditorProps {
  fields: FieldDefinition[];
  onAddField: (field: CreateFieldFormData) => Promise<void>;
  onUpdateField: (fieldId: string, updates: UpdateFieldFormData) => Promise<void>;
  onDeleteField: (fieldId: string) => Promise<void>;
  onReorderFields?: (fieldIds: string[]) => Promise<void>;
}

export interface CreateFieldFormData {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
  options?: { id: string; label: string; color: string; position: number }[];
  targetObject?: string;
  visibleInList: boolean;
}

export interface UpdateFieldFormData {
  label?: string;
  type?: FieldType;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
  options?: { id: string; label: string; color: string; position: number }[];
  visibleInList?: boolean;
}

const FIELD_TYPES: { value: FieldType; label: string; description: string }[] = [
  { value: 'TEXT', label: 'Texto', description: 'Texto corto' },
  { value: 'TEXT_AREA', label: 'Área de texto', description: 'Texto largo' },
  { value: 'NUMBER', label: 'Número', description: 'Valores numéricos' },
  { value: 'CURRENCY', label: 'Moneda', description: 'Valores monetarios' },
  { value: 'DATE', label: 'Fecha', description: 'Solo fecha' },
  { value: 'DATE_TIME', label: 'Fecha y hora', description: 'Fecha con hora' },
  { value: 'BOOLEAN', label: 'Booleano', description: 'Verdadero/Falso' },
  { value: 'SELECT', label: 'Selección única', description: 'Dropdown de opciones' },
  { value: 'MULTI_SELECT', label: 'Selección múltiple', description: 'Múltiples opciones' },
  { value: 'EMAIL', label: 'Email', description: 'Correo electrónico' },
  { value: 'PHONE', label: 'Teléfono', description: 'Número telefónico' },
  { value: 'URL', label: 'URL', description: 'Enlace web' },
  { value: 'RATING', label: 'Calificación', description: '1-5 estrellas' },
  { value: 'LOOKUP', label: 'Lookup', description: 'Relación con otro objeto' },
  { value: 'MANY_TO_MANY', label: 'Muchos a muchos', description: 'Relación M:N' },
  { value: 'FORMULA', label: 'Fórmula', description: 'Campo calculado' },
  { value: 'FILE', label: 'Archivo', description: 'Archivo adjunto' },
  { value: 'IMAGE', label: 'Imagen', description: 'Imagen' },
];

const COLOR_OPTIONS = [
  '#22c55e', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#f43f5e', '#f97316', '#eab308', '#14b8a6', '#06b6d4',
];

export function FieldEditor({
  fields,
  onAddField,
  onUpdateField,
  onDeleteField,
}: FieldEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [formData, setFormData] = useState<CreateFieldFormData>({
    name: '',
    label: '',
    type: 'TEXT',
    required: false,
    visibleInList: true,
  });
  const [selectOptions, setSelectOptions] = useState<{ id: string; label: string; color: string; position: number }[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      ...formData,
      options: formData.type === 'SELECT' || formData.type === 'MULTI_SELECT' ? selectOptions : undefined,
    };

    if (editingField) {
      await onUpdateField(editingField.id, data);
      setEditingField(null);
    } else {
      await onAddField(data);
    }

    resetForm();
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingField(null);
    setFormData({
      name: '',
      label: '',
      type: 'TEXT',
      required: false,
      visibleInList: true,
    });
    setSelectOptions([]);
  };

  const openEdit = (field: FieldDefinition) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      defaultValue: field.defaultValue,
      description: field.description,
      visibleInList: field.visibleInList,
      options: field.options,
    });
    if (field.options) {
      setSelectOptions(field.options);
    }
    setIsAdding(true);
  };

  const addSelectOption = () => {
    setSelectOptions([
      ...selectOptions,
      {
        id: `option_${selectOptions.length + 1}`,
        label: `Opción ${selectOptions.length + 1}`,
        color: COLOR_OPTIONS[selectOptions.length % COLOR_OPTIONS.length],
        position: selectOptions.length,
      },
    ]);
  };

  const updateSelectOption = (index: number, updates: Partial<typeof selectOptions[0]>) => {
    const newOptions = [...selectOptions];
    newOptions[index] = { ...newOptions[index], ...updates };
    setSelectOptions(newOptions);
  };

  const removeSelectOption = (index: number) => {
    setSelectOptions(selectOptions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Campos</h3>
          <p className="text-sm text-muted-foreground">
            Gestiona los campos de este objeto
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir Campo
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre (DB)</Label>
                  <Input
                    id="name"
                    placeholder="ej: amount"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/\s/g, '_') })
                    }
                    disabled={!!editingField}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label</Label>
                  <Input
                    id="label"
                    placeholder="ej: Monto"
                    value={formData.label}
                    onChange={(e) =>
                      setFormData({ ...formData, label: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo de Campo</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: FieldType | null) =>
                      // Base UI emite null al deseleccionar; el campo
                      // siempre tiene que tener un tipo.
                      setFormData({ ...formData, type: value ?? formData.type })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {type.description}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Input
                    id="description"
                    placeholder="Descripción del campo..."
                    value={formData.description || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
              </div>

              {(formData.type === 'SELECT' || formData.type === 'MULTI_SELECT') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Opciones</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addSelectOption}>
                      <Plus className="h-3 w-3 mr-1" />
                      Añadir Opción
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {selectOptions.map((option, index) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <Input
                          value={option.label}
                          onChange={(e) =>
                            updateSelectOption(index, { label: e.target.value })
                          }
                          className="flex-1"
                          placeholder="Label de opción"
                        />
                        <Select
                          value={option.color}
                          onValueChange={(color) =>
                            updateSelectOption(index, { color: color ?? option.color })
                          }
                        >
                          <SelectTrigger className="w-20">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: option.color }}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {COLOR_OPTIONS.map((color) => (
                              <SelectItem key={color} value={color}>
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: color }}
                                />
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelectOption(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="required"
                    checked={formData.required}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, required: checked })
                    }
                  />
                  <Label htmlFor="required">Requerido</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="visibleInList"
                    checked={formData.visibleInList}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, visibleInList: checked })
                    }
                  />
                  <Label htmlFor="visibleInList">Visible en listados</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
                <Button type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  {editingField ? 'Guardar Cambios' : 'Añadir Campo'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            <div className="flex-1 grid grid-cols-12 gap-4 items-center">
              <div className="col-span-3">
                <div className="font-medium">{field.label}</div>
                <div className="text-xs text-muted-foreground">{field.name}</div>
              </div>
              <div className="col-span-2">
                <Badge variant="outline" className="text-xs">
                  {FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type}
                </Badge>
              </div>
              <div className="col-span-2">
                {field.required && (
                  <Badge variant="secondary" className="text-xs">
                    Requerido
                  </Badge>
                )}
              </div>
              <div className="col-span-3">
                <div className="text-xs text-muted-foreground">
                  {field.visibleInList ? 'Visible en listados' : 'Oculto en listados'}
                </div>
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(field)}
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
                {!field.isSystem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteField(field.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay campos configurados. Añade el primer campo para comenzar.
          </div>
        )}
      </div>
    </div>
  );
}
