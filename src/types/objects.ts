/**
 * Tipos para objetos personalizados (Custom Objects)
 * Inspirado en Twenty CRM pero adaptado para ARCA
 */

/**
 * Los tipos de campo, como valor y como tipo a la vez.
 *
 * El SDK los usa escribiendo `FieldType.TEXT`, así que no alcanza con una
 * unión de literales: hace falta algo que exista en tiempo de ejecución. El
 * objeto `as const` da las dos cosas sin recurrir a un `enum`, que en
 * TypeScript genera código y no se lleva bien con `isolatedModules`.
 */
export const FieldType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  CURRENCY: 'CURRENCY',
  DATE: 'DATE',
  DATE_TIME: 'DATE_TIME',
  BOOLEAN: 'BOOLEAN',
  SELECT: 'SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  URL: 'URL',
  TEXT_AREA: 'TEXT_AREA',
  RATING: 'RATING',
  LOOKUP: 'LOOKUP',
  MANY_TO_MANY: 'MANY_TO_MANY',
  FORMULA: 'FORMULA',
  FILE: 'FILE',
  IMAGE: 'IMAGE',
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export interface FieldDefinition {
  id: string;
  name: string; // snake_case para DB
  label: string; // Label legible
  labelSingular: string;
  labelPlural: string;
  type: FieldType;
  required: boolean;
  defaultValue?: any;
  description?: string;
  icon?: string;
  // Para SELECT/MULTI_SELECT
  options?: SelectOption[];
  // Para LOOKUP/MANY_TO_MANY
  targetObject?: string;
  relationAttribute?: string;
  // Para FORMULA
  formula?: string;
  // Orden en UI
  position: number;
  // Visible en listados
  visibleInList: boolean;
  // Ancho en tabla
  columnSize?: number;
  // Campo del sistema: la interfaz no deja borrarlo. La columna existe en
  // la base desde la migración 077, solo faltaba acá.
  isSystem?: boolean;
  isActive?: boolean;
}

export interface SelectOption {
  id: string;
  label: string;
  color: string;
  position: number;
}

export interface ObjectDefinition {
  id: string;
  nameSingular: string; // snake_case
  namePlural: string; // snake_case
  labelSingular: string; // "Deal"
  labelPlural: string; // "Deals"
  description?: string;
  icon: string; // Lucide icon name
  primaryFieldId: string; // ID del campo principal (nombre/título)
  fields: FieldDefinition[];
  // Vistas por defecto
  defaultView?: ViewType;
  // Permisos por defecto
  permissions?: ObjectPermissions;
  // Audit
  createdAt: Date;
  updatedAt: Date;
  // Estado
  isActive: boolean;
  // Es sistema (no editable)
  isSystem: boolean;
}

export type ViewType = 'TABLE' | 'KANBAN' | 'TIMELINE' | 'GALLERY' | 'CALENDAR';

export interface ViewDefinition {
  id: string;
  objectId: string;
  name: string;
  type: ViewType;
  filters?: Filter[];
  sorts?: Sort[];
  columns?: string[]; // Field IDs visibles
  kanbanFieldId?: string; // Campo para agrupar en kanban
  timelineStartFieldId?: string;
  timelineEndFieldId?: string;
  galleryFieldId?: string; // Campo imagen para galería
  isDefault: boolean;
  position: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Filter {
  fieldId: string;
  operator: FilterOperator;
  value: any;
  conjunction?: 'AND' | 'OR';
}

export type FilterOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_OR_EQUALS'
  | 'LESS_OR_EQUALS'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  | 'IS_TRUE'
  | 'IS_FALSE'
  | 'IS_AFTER'
  | 'IS_BEFORE'
  | 'IS_TODAY'
  | 'IN_PAST'
  | 'IN_FUTURE';

export interface Sort {
  fieldId: string;
  direction: 'ASC' | 'DESC';
}

export interface ObjectPermissions {
  canRead: PermissionLevel;
  canCreate: PermissionLevel;
  canUpdate: PermissionLevel;
  canDelete: PermissionLevel;
  // Campos específicos restringidos
  restrictedFields?: FieldPermission[];
}

export type PermissionLevel = 'ALL' | 'OWN' | 'TEAM' | 'NONE';

export interface FieldPermission {
  fieldId: string;
  canRead: boolean;
  canUpdate: boolean;
}

export interface ObjectRecord {
  id: string;
  objectId: string;
  accountId: string;
  fields: Record<string, any>;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  accountId: string;
  objectId: string;
  recordId: string;
  fieldId?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValue?: any;
  newValue?: any;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Objetos del sistema por defecto
export const SYSTEM_OBJECTS: ObjectDefinition[] = [
  {
    id: 'contacts',
    nameSingular: 'contact',
    namePlural: 'contacts',
    labelSingular: 'Contacto',
    labelPlural: 'Contactos',
    description: 'Personas y contactos individuales',
    icon: 'User',
    primaryFieldId: 'name',
    fields: [], // Se llenan desde la DB existente
    defaultView: 'TABLE',
    isSystem: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'companies',
    nameSingular: 'company',
    namePlural: 'companies',
    labelSingular: 'Compañía',
    labelPlural: 'Compañías',
    description: 'Empresas y organizaciones',
    icon: 'Building2',
    primaryFieldId: 'name',
    fields: [],
    defaultView: 'TABLE',
    isSystem: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'deals',
    nameSingular: 'deal',
    namePlural: 'deals',
    labelSingular: 'Oportunidad',
    labelPlural: 'Oportunidades',
    description: 'Oportunidades de venta y negocios',
    icon: 'TrendingUp',
    primaryFieldId: 'name',
    fields: [],
    defaultView: 'KANBAN',
    isSystem: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'tasks',
    nameSingular: 'task',
    namePlural: 'tasks',
    labelSingular: 'Tarea',
    labelPlural: 'Tareas',
    description: 'Tareas y actividades por realizar',
    icon: 'CheckSquare',
    primaryFieldId: 'title',
    fields: [],
    // 'LIST' no es una vista que exista: las que hay son TABLE, KANBAN,
    // TIMELINE, GALLERY y CALENDAR. Una lista de tareas se ve bien como
    // tabla, que es lo que usan los demás objetos de sistema.
    defaultView: 'TABLE',
    isSystem: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
