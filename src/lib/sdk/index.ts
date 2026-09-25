/**
 * SDK Declarativo para ARCA
 * Inspirado en Twenty CRM - Define objetos, campos y vistas como código
 * 
 * Uso:
 * ```typescript
 * import { defineObject, FieldType } from '@/lib/sdk';
 * 
 * export default defineObject({
 *   nameSingular: 'project',
 *   namePlural: 'projects',
 *   labelSingular: 'Proyecto',
 *   labelPlural: 'Proyectos',
 *   icon: 'Folder',
 *   fields: [
 *     { name: 'name', label: 'Nombre', type: FieldType.TEXT, required: true },
 *     { name: 'amount', label: 'Presupuesto', type: FieldType.CURRENCY },
 *     { name: 'status', label: 'Estado', type: FieldType.SELECT, options: [...] },
 *   ],
 * });
 * ```
 */

// FieldType entra como valor, no solo como tipo: el SDK escribe
// `FieldType.TEXT`, que tiene que existir en tiempo de ejecución.
import { FieldType } from '@/types/objects';
import type {
  ObjectDefinition,
  FieldDefinition,
  ViewDefinition,
  Filter as FilterDef,
  Sort as SortDef,
} from '@/types/objects';

export { FieldType } from '@/types/objects';
export type {
  ObjectDefinition,
  FieldDefinition,
  ViewDefinition,
  SelectOption,
} from '@/types/objects';

// Helpers para campos
export const Field = {
  TEXT: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Texto',
    labelSingular: config.label || 'Texto',
    labelPlural: config.label || 'Texto',
    type: FieldType.TEXT,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  NUMBER: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Número',
    labelSingular: config.label || 'Número',
    labelPlural: config.label || 'Número',
    type: FieldType.NUMBER,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 100,
    ...config,
  }),

  CURRENCY: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Moneda',
    labelSingular: config.label || 'Moneda',
    labelPlural: config.label || 'Moneda',
    type: FieldType.CURRENCY,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 120,
    ...config,
  }),

  DATE: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Fecha',
    labelSingular: config.label || 'Fecha',
    labelPlural: config.label || 'Fecha',
    type: FieldType.DATE,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 120,
    ...config,
  }),

  DATE_TIME: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Fecha y Hora',
    labelSingular: config.label || 'Fecha y Hora',
    labelPlural: config.label || 'Fecha y Hora',
    type: FieldType.DATE_TIME,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 160,
    ...config,
  }),

  BOOLEAN: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Booleano',
    labelSingular: config.label || 'Booleano',
    labelPlural: config.label || 'Booleano',
    type: FieldType.BOOLEAN,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 100,
    ...config,
  }),

  SELECT: (config: Partial<FieldDefinition> & { options: FieldDefinition['options'] }): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Selección',
    labelSingular: config.label || 'Selección',
    labelPlural: config.label || 'Selección',
    type: FieldType.SELECT,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  MULTI_SELECT: (config: Partial<FieldDefinition> & { options: FieldDefinition['options'] }): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Selección Múltiple',
    labelSingular: config.label || 'Selección Múltiple',
    labelPlural: config.label || 'Selección Múltiple',
    type: FieldType.MULTI_SELECT,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 200,
    ...config,
  }),

  EMAIL: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Email',
    labelSingular: config.label || 'Email',
    labelPlural: config.label || 'Email',
    type: FieldType.EMAIL,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 200,
    ...config,
  }),

  PHONE: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Teléfono',
    labelSingular: config.label || 'Teléfono',
    labelPlural: config.label || 'Teléfono',
    type: FieldType.PHONE,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  URL: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'URL',
    labelSingular: config.label || 'URL',
    labelPlural: config.label || 'URL',
    type: FieldType.URL,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 200,
    ...config,
  }),

  TEXT_AREA: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Texto Largo',
    labelSingular: config.label || 'Texto Largo',
    labelPlural: config.label || 'Texto Largo',
    type: FieldType.TEXT_AREA,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 250,
    ...config,
  }),

  RATING: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Calificación',
    labelSingular: config.label || 'Calificación',
    labelPlural: config.label || 'Calificación',
    type: FieldType.RATING,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 120,
    ...config,
  }),

  LOOKUP: (config: Partial<FieldDefinition> & { targetObject: string }): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Relación',
    labelSingular: config.label || 'Relación',
    labelPlural: config.label || 'Relación',
    type: FieldType.LOOKUP,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  MANY_TO_MANY: (config: Partial<FieldDefinition> & { targetObject: string }): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Muchos a Muchos',
    labelSingular: config.label || 'Muchos a Muchos',
    labelPlural: config.label || 'Muchos a Muchos',
    type: FieldType.MANY_TO_MANY,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  FORMULA: (config: Partial<FieldDefinition> & { formula: string }): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Fórmula',
    labelSingular: config.label || 'Fórmula',
    labelPlural: config.label || 'Fórmula',
    type: FieldType.FORMULA,
    required: false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  FILE: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Archivo',
    labelSingular: config.label || 'Archivo',
    labelPlural: config.label || 'Archivo',
    type: FieldType.FILE,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 150,
    ...config,
  }),

  IMAGE: (config: Partial<FieldDefinition>): FieldDefinition => ({
    id: '',
    name: config.name || '',
    label: config.label || 'Imagen',
    labelSingular: config.label || 'Imagen',
    labelPlural: config.label || 'Imagen',
    type: FieldType.IMAGE,
    required: config.required || false,
    position: config.position || 0,
    visibleInList: config.visibleInList ?? true,
    columnSize: config.columnSize || 100,
    ...config,
  }),
};

// Configuración de objeto
export interface ObjectConfig {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description?: string;
  icon?: string;
  fields: FieldDefinition[];
  defaultView?: 'TABLE' | 'KANBAN' | 'TIMELINE' | 'GALLERY';
  permissions?: {
    canRead?: 'ALL' | 'OWN' | 'TEAM' | 'NONE';
    canCreate?: 'ALL' | 'OWN' | 'TEAM' | 'NONE';
    canUpdate?: 'ALL' | 'OWN' | 'TEAM' | 'NONE';
    canDelete?: 'ALL' | 'OWN' | 'TEAM' | 'NONE';
  };
}

/**
 * Define un objeto personalizado
 */
export function defineObject(config: ObjectConfig): ObjectDefinition {
  // Validar que el primer campo sea el primario (name por defecto)
  const primaryFieldId = config.fields[0]?.name || 'name';

  // Ordenar campos por posición
  const sortedFields = [...config.fields].sort((a, b) => a.position - b.position);

  return {
    id: '', // Se genera al crear
    nameSingular: config.nameSingular,
    namePlural: config.namePlural,
    labelSingular: config.labelSingular,
    labelPlural: config.labelPlural,
    description: config.description,
    icon: config.icon || 'Folder',
    primaryFieldId,
    fields: sortedFields,
    defaultView: config.defaultView || 'TABLE',
    permissions: config.permissions ? {
      canRead: config.permissions.canRead || 'ALL',
      canCreate: config.permissions.canCreate || 'ALL',
      canUpdate: config.permissions.canUpdate || 'OWN',
      canDelete: config.permissions.canDelete || 'NONE',
    } : undefined,
    isSystem: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Helpers para vistas
export const View = {
  TABLE: (config: {
    name: string;
    columns?: string[];
    filters?: FilterDef[];
    sorts?: SortDef[];
  }): Partial<ViewDefinition> => ({
    name: config.name,
    type: 'TABLE',
    columns: config.columns,
    filters: config.filters,
    sorts: config.sorts,
  }),

  KANBAN: (config: {
    name: string;
    kanbanFieldId: string;
    filters?: FilterDef[];
  }): Partial<ViewDefinition> => ({
    name: config.name,
    type: 'KANBAN',
    kanbanFieldId: config.kanbanFieldId,
    filters: config.filters,
  }),

  GALLERY: (config: {
    name: string;
    galleryFieldId: string;
    filters?: FilterDef[];
  }): Partial<ViewDefinition> => ({
    name: config.name,
    type: 'GALLERY',
    galleryFieldId: config.galleryFieldId,
    filters: config.filters,
  }),

  TIMELINE: (config: {
    name: string;
    timelineStartFieldId: string;
    timelineEndFieldId?: string;
    filters?: FilterDef[];
  }): Partial<ViewDefinition> => ({
    name: config.name,
    type: 'TIMELINE',
    timelineStartFieldId: config.timelineStartFieldId,
    timelineEndFieldId: config.timelineEndFieldId,
    filters: config.filters,
  }),
};

// Helpers para filtros
export const Filter = {
  EQUALS: (fieldId: string, value: unknown) => ({ fieldId, operator: 'EQUALS' as const, value }),
  NOT_EQUALS: (fieldId: string, value: unknown) => ({ fieldId, operator: 'NOT_EQUALS' as const, value }),
  CONTAINS: (fieldId: string, value: string) => ({ fieldId, operator: 'CONTAINS' as const, value }),
  GREATER_THAN: (fieldId: string, value: number) => ({ fieldId, operator: 'GREATER_THAN' as const, value }),
  LESS_THAN: (fieldId: string, value: number) => ({ fieldId, operator: 'LESS_THAN' as const, value }),
  IS_EMPTY: (fieldId: string) => ({ fieldId, operator: 'IS_EMPTY' as const, value: null }),
  IS_NOT_EMPTY: (fieldId: string) => ({ fieldId, operator: 'IS_NOT_EMPTY' as const, value: null }),
};

// Helpers para ordenamiento
export const Sort = {
  ASC: (fieldId: string) => ({ fieldId, direction: 'ASC' as const }),
  DESC: (fieldId: string) => ({ fieldId, direction: 'DESC' as const }),
};

// Ejemplo de uso:
/*
export const ProjectObject = defineObject({
  nameSingular: 'project',
  namePlural: 'projects',
  labelSingular: 'Proyecto',
  labelPlural: 'Proyectos',
  description: 'Gestión de proyectos',
  icon: 'Folder',
  defaultView: 'KANBAN',
  fields: [
    Field.TEXT({ name: 'name', label: 'Nombre', required: true, position: 0 }),
    Field.CURRENCY({ name: 'budget', label: 'Presupuesto', position: 1 }),
    Field.SELECT({
      name: 'status',
      label: 'Estado',
      position: 2,
      options: [
        { id: 'planning', label: 'Planificación', color: '#3b82f6', position: 0 },
        { id: 'in_progress', label: 'En Progreso', color: '#eab308', position: 1 },
        { id: 'completed', label: 'Completado', color: '#22c55e', position: 2 },
      ],
    }),
    Field.DATE({ name: 'deadline', label: 'Fecha Límite', position: 3 }),
    Field.LOOKUP({ name: 'client_id', label: 'Cliente', targetObject: 'companies', position: 4 }),
  ],
});

export const ProjectViews = {
  all: View.TABLE({
    name: 'Todos',
    columns: ['name', 'budget', 'status', 'deadline', 'client_id'],
    sorts: [Sort.DESC('createdAt')],
  }),
  kanban: View.KANBAN({
    name: 'Por Estado',
    kanbanFieldId: 'status',
  }),
};
*/
