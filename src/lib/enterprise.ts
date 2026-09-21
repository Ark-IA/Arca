/**
 * ARCA Enterprise SDK
 * Exporta todas las funcionalidades enterprise
 */

// Tipos
//
// `Filter` y `Sort` no se reexportan desde acá aunque existan como tipos
// en @/types/objects: el SDK exporta constructores con esos mismos
// nombres, y reexportar las dos cosas deja el identificador duplicado.
// Mandan los del SDK, que son la API que su documentación anuncia; quien
// necesite las interfaces las importa de @/types/objects directamente.
export type {
  ObjectDefinition,
  FieldDefinition,
  ViewDefinition,
  SelectOption,
  FieldType,
  ViewType,
  ObjectPermissions,
  PermissionLevel,
  ObjectRecord,
  AuditLog,
} from '@/types/objects';

// SDK Declarativo
export {
  defineObject,
  Field,
  View,
  Filter,
  Sort,
  type ObjectConfig,
} from '@/lib/sdk';

// `Formula` no está en el SDK sino en el motor de fórmulas. El resto de
// ese módulo ya se reexporta más abajo, en "Motor de Fórmulas".
export { Formula } from '@/lib/objects/formula-engine';

// Managers
export {
  createCustomObjectsManager,
  CustomObjectsManager,
  type CreateObjectInput,
  type CreateFieldInput,
  type UpdateObjectInput,
} from '@/lib/objects/manager';

export {
  createCustomRecordsManager,
  CustomRecordsManager,
  type CreateRecordInput,
  type UpdateRecordInput,
  type QueryOptions,
} from '@/lib/objects/records';

export {
  createPermissionManager,
  createPermissionChecker,
  PermissionManager,
  type PermissionInput,
  type PermissionCheckResult,
  type ObjectPermission,
  type FieldPermission,
  type PermissionScope,
  type Role,
  type ActionType,
} from '@/lib/objects/permissions';

export {
  createRelationManager,
  RelationManager,
  type CreateRelationInput,
  type RelationDefinition,
  type RollupConfig,
} from '@/lib/objects/relations';

// Motor de Fórmulas
export {
  FormulaEngine,
  CalculatedFieldsManager,
  createFormulaField,
  PREDEFINED_FORMULAS,
  type FormulaField,
  type FormulaResult,
} from '@/lib/objects/formula-engine';

// Reportes
export {
  ReportBuilder,
  Report,
  REPORTS_MIGRATION,
  type ReportConfig,
  type ReportResult,
  type ReportFilter,
  type ReportGroup,
  type ReportMetric,
  type ReportColumn,
  type FilterOperator,
  type AggregateFunction,
  type ChartType,
  type ReportType,
} from '@/lib/reports/builder';

// AI Tools
export {
  createAIToolsManager,
  AIToolsManager,
  AI_TOOLS_MIGRATION,
  type ToolDefinition,
  type ToolParameter,
  type ToolExecution,
  type AIAction,
  type AgentConfig,
  type ToolCategory,
} from '@/lib/ai/tools/manager';

// Componentes UI
export {
  CustomObjectsList,
  type CreateObjectFormData,
  type UpdateObjectFormData,
} from '@/components/objects/object-list';

export {
  FieldEditor,
  type CreateFieldFormData,
  type UpdateFieldFormData,
} from '@/components/objects/field-editor';

export {
  DynamicTableView,
} from '@/components/objects/dynamic-table';

export {
  LayoutBuilder,
  LayoutViewer,
  type LayoutConfig,
  type LayoutSection,
} from '@/components/layout-builder';

// Utilidades
export const VERSION = '1.0.0';
export const ENTERPRISE_FEATURES = [
  'custom_objects',
  'granular_permissions',
  'object_relations',
  'multiple_views',
  'formula_fields',
  'custom_layouts',
  'ai_tools',
  'advanced_reports',
  'audit_log',
  'bulk_operations',
  'centralized_files',
  'advanced_tasks',
  'activity_timeline',
];

export function getEnterpriseFeatures(): string[] {
  return ENTERPRISE_FEATURES;
}

export function hasFeature(feature: string): boolean {
  return ENTERPRISE_FEATURES.includes(feature);
}
