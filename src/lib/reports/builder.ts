/**
 * Módulo de Reportes Avanzados
 * Inspirado en Tableau, PowerBI y Salesforce Reports
 * 
 * Características:
 * - Reportes con filtros cruzados
 * - Agrupaciones múltiples
 * - Métricas calculadas
 * - Gráficos (barra, línea, pastel, etc.)
 * - Exportación (CSV, PDF, Excel)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ReportType = 'TABLE' | 'SUMMARY' | 'MATRIX' | 'CHART';
export type ChartType = 'BAR' | 'LINE' | 'PIE' | 'DONUT' | 'AREA' | 'SCATTER';
export type AggregateFunction = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'MEDIAN' | 'STDDEV';

export interface ReportFilter {
  fieldId: string;
  fieldPath: string; // Para campos relacionados: contact.company.name
  operator: FilterOperator;
  // Opcional porque IS_NULL e IS_NOT_NULL no comparan contra nada: el
  // operador ya dice todo. Exigirlo obligaba a inventar un valor.
  value?: any;
  value2?: any; // Para BETWEEN
  condition?: 'AND' | 'OR';
}

export type FilterOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'GREATER_OR_EQUALS'
  | 'LESS_OR_EQUALS'
  | 'BETWEEN'
  | 'IN'
  | 'NOT_IN'
  | 'IS_NULL'
  | 'IS_NOT_NULL'
  | 'IS_TRUE'
  | 'IS_FALSE';

export interface ReportGroup {
  fieldId: string;
  fieldPath: string;
  showSubtotals: boolean;
  showGrandTotal: boolean;
  sortOrder: 'ASC' | 'DESC';
}

export interface ReportMetric {
  id: string;
  fieldId: string;
  fieldPath: string;
  aggregate: AggregateFunction;
  label: string;
  format?: 'NUMBER' | 'CURRENCY' | 'PERCENT' | 'DATE';
  formula?: string; // Para métricas calculadas
}

export interface ReportColumn {
  fieldId: string;
  fieldPath: string;
  label: string;
  width?: number;
  visible: boolean;
  position: number;
}

export interface ReportConfig {
  id: string;
  name: string;
  description?: string;
  type: ReportType;
  objectType: string; // Objeto principal
  filters: ReportFilter[];
  groups: ReportGroup[];
  metrics: ReportMetric[];
  columns: ReportColumn[];
  chartConfig?: {
    type: ChartType;
    xAxis: string;
    yAxis: string;
    groupBy?: string;
    colors?: string[];
    showLegend: boolean;
    showGrid: boolean;
  };
  sortBy?: {
    fieldId: string;
    direction: 'ASC' | 'DESC';
  };
  limit?: number;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportResult {
  data: any[];
  summary: Record<string, any>;
  groups?: ReportGroupResult[];
  totalRows: number;
  executedAt: Date;
  executionTime: number;
}

export interface ReportGroupResult {
  groupValue: any;
  data: any[];
  summary: Record<string, any>;
  subgroups?: ReportGroupResult[];
}

export class ReportBuilder {
  private supabase: SupabaseClient;
  private accountId: string;
  private userId: string;

  constructor(supabase: SupabaseClient, accountId: string, userId: string) {
    this.supabase = supabase;
    this.accountId = accountId;
    this.userId = userId;
  }

  /**
   * Crear un reporte
   */
  async createReport(config: Omit<ReportConfig, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<ReportConfig> {
    const now = new Date();
    
    const report: ReportConfig = {
      ...config,
      id: `report_${Date.now()}`,
      createdBy: this.userId,
      createdAt: now,
      updatedAt: now,
    };

    // Guardar en DB
    const { error } = await this.supabase
      .from('custom_reports')
      .insert({
        account_id: this.accountId,
        name: report.name,
        description: report.description,
        config: JSON.stringify(report),
        is_public: report.isPublic,
        created_by: this.userId,
      });

    if (error) throw error;

    return report;
  }

  /**
   * Ejecutar un reporte
   */
  async executeReport(reportConfig: ReportConfig): Promise<ReportResult> {
    const startTime = performance.now();

    try {
      // Construir consulta
      let query = this.supabase
        .from('custom_object_records')
        .select('*', { count: 'exact' })
        .eq('object_id', reportConfig.objectType)
        .eq('account_id', this.accountId);

      // Aplicar filtros
      for (const filter of reportConfig.filters) {
        query = this.applyFilter(query, filter);
      }

      // Aplicar límite
      if (reportConfig.limit) {
        query = query.limit(reportConfig.limit);
      }

      // Ejecutar consulta
      const { data, error } = await query;

      if (error) throw error;

      // Procesar datos
      const processedData = this.processData(data || [], reportConfig);

      // Calcular agrupaciones
      let groups: ReportGroupResult[] | undefined;
      if (reportConfig.groups.length > 0) {
        groups = this.groupData(processedData, reportConfig.groups, reportConfig.metrics);
      }

      // Calcular métricas
      const summary = this.calculateMetrics(processedData, reportConfig.metrics);

      const endTime = performance.now();

      return {
        data: processedData,
        summary,
        groups,
        totalRows: processedData.length,
        executedAt: new Date(),
        executionTime: endTime - startTime,
      };
    } catch (error: any) {
      throw new Error(`Error ejecutando reporte: ${error.message}`);
    }
  }

  /**
   * Aplicar filtro a una consulta
   */
  private applyFilter(
    query: any,
    filter: ReportFilter
  ): any {
    const fieldPath = `fields.${filter.fieldPath}`;

    switch (filter.operator) {
      case 'EQUALS':
        return query.eq(fieldPath as any, filter.value);
      
      case 'NOT_EQUALS':
        return query.neq(fieldPath as any, filter.value);
      
      case 'CONTAINS':
        return query.like(fieldPath as any, `%${filter.value}%`);
      
      case 'NOT_CONTAINS':
        return query.not(fieldPath as any, 'like', `%${filter.value}%`);
      
      case 'STARTS_WITH':
        return query.like(fieldPath as any, `${filter.value}%`);
      
      case 'ENDS_WITH':
        return query.like(fieldPath as any, `%${filter.value}`);
      
      case 'GREATER_THAN':
        return query.gt(fieldPath as any, filter.value);
      
      case 'LESS_THAN':
        return query.lt(fieldPath as any, filter.value);
      
      case 'GREATER_OR_EQUALS':
        return query.gte(fieldPath as any, filter.value);
      
      case 'LESS_OR_EQUALS':
        return query.lte(fieldPath as any, filter.value);
      
      case 'BETWEEN':
        return query.gte(fieldPath as any, filter.value).lte(fieldPath as any, filter.value2);
      
      case 'IN':
        return query.in(fieldPath as any, filter.value);
      
      case 'NOT_IN':
        return query.not(fieldPath as any, 'in', filter.value);
      
      case 'IS_NULL':
        return query.is(fieldPath as any, null);
      
      case 'IS_NOT_NULL':
        return query.not(fieldPath as any, 'is', null);
      
      case 'IS_TRUE':
        return query.eq(fieldPath as any, true);
      
      case 'IS_FALSE':
        return query.eq(fieldPath as any, false);
      
      default:
        return query;
    }
  }

  /**
   * Procesar datos del reporte
   */
  private processData(records: any[], reportConfig: ReportConfig): any[] {
    return records.map((record) => {
      const row: any = { id: record.id };

      // Extraer valores de campos
      for (const column of reportConfig.columns.filter(c => c.visible)) {
        const value = this.getFieldValue(record.fields, column.fieldPath);
        row[column.fieldId] = value;
      }

      // Calcular métricas
      for (const metric of reportConfig.metrics) {
        const value = this.getFieldValue(record.fields, metric.fieldPath);
        row[`metric_${metric.id}`] = value;
      }

      return row;
    });
  }

  /**
   * Obtener valor de campo por path
   */
  private getFieldValue(fields: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let value = fields;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  /**
   * Agrupar datos
   */
  private groupData(
    data: any[],
    groups: ReportGroup[],
    metrics: ReportMetric[]
  ): ReportGroupResult[] {
    if (groups.length === 0) return [];

    const primaryGroup = groups[0];
    const grouped = new Map<any, any[]>();

    // Agrupar por campo principal
    for (const row of data) {
      const groupValue = row[primaryGroup.fieldId];
      if (!grouped.has(groupValue)) {
        grouped.set(groupValue, []);
      }
      grouped.get(groupValue)!.push(row);
    }

    // Construir resultados
    const results: ReportGroupResult[] = [];

    for (const [groupValue, groupData] of grouped) {
      const result: ReportGroupResult = {
        groupValue,
        data: groupData,
        summary: this.calculateMetrics(groupData, metrics),
      };

      // Subgrupos
      if (groups.length > 1) {
        result.subgroups = this.groupData(groupData, groups.slice(1), metrics);
      }

      results.push(result);
    }

    // Ordenar
    results.sort((a, b) => {
      const aVal = a.groupValue;
      const bVal = b.groupValue;
      
      if (primaryGroup.sortOrder === 'ASC') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return results;
  }

  /**
   * Calcular métricas
   */
  private calculateMetrics(data: any[], metrics: ReportMetric[]): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const metric of metrics) {
      const values = data
        .map(row => row[`metric_${metric.id}`])
        .filter(v => v !== null && v !== undefined && typeof v === 'number');

      summary[metric.id] = this.aggregate(values, metric.aggregate);
    }

    return summary;
  }

  /**
   * Función de agregación
   */
  private aggregate(values: number[], fn: AggregateFunction): number {
    if (values.length === 0) return 0;

    switch (fn) {
      case 'COUNT':
        return values.length;
      
      case 'SUM':
        return values.reduce((a, b) => a + b, 0);
      
      case 'AVG':
        return values.reduce((a, b) => a + b, 0) / values.length;
      
      case 'MIN':
        return Math.min(...values);
      
      case 'MAX':
        return Math.max(...values);
      
      case 'MEDIAN':
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      
      case 'STDDEV':
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(v => Math.pow(v - avg, 2));
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
      
      default:
        return 0;
    }
  }

  /**
   * Exportar reporte a CSV
   */
  async exportToCSV(reportConfig: ReportConfig): Promise<string> {
    const result = await this.executeReport(reportConfig);

    const headers = reportConfig.columns
      .filter(c => c.visible)
      .map(c => c.label)
      .join(',');

    const rows = result.data.map(row =>
      reportConfig.columns
        .filter(c => c.visible)
        .map(c => {
          const value = row[c.fieldId];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value;
        })
        .join(',')
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Obtener reportes guardados
   */
  async getSavedReports(): Promise<ReportConfig[]> {
    const { data, error } = await this.supabase
      .from('custom_reports')
      .select('*')
      .eq('account_id', this.accountId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(r => ({
      ...r.config,
      id: r.id,
    }));
  }

  /**
   * Eliminar reporte
   */
  async deleteReport(reportId: string): Promise<void> {
    const { error } = await this.supabase
      .from('custom_reports')
      .delete()
      .eq('id', reportId)
      .eq('account_id', this.accountId);

    if (error) throw error;
  }
}

/**
 * Helpers para construir reportes
 */
export const Report = {
  filter: {
    equals: (fieldId: string, value: any): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'EQUALS',
      value,
    }),
    notEquals: (fieldId: string, value: any): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'NOT_EQUALS',
      value,
    }),
    contains: (fieldId: string, value: string): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'CONTAINS',
      value,
    }),
    greaterThan: (fieldId: string, value: number): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'GREATER_THAN',
      value,
    }),
    lessThan: (fieldId: string, value: number): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'LESS_THAN',
      value,
    }),
    between: (fieldId: string, min: number, max: number): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'BETWEEN',
      value: min,
      value2: max,
    }),
    isNull: (fieldId: string): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'IS_NULL',
    }),
    isNotNull: (fieldId: string): ReportFilter => ({
      fieldId,
      fieldPath: fieldId,
      operator: 'IS_NOT_NULL',
    }),
  },

  group: {
    by: (fieldId: string, sortOrder: 'ASC' | 'DESC' = 'ASC'): ReportGroup => ({
      fieldId,
      fieldPath: fieldId,
      showSubtotals: true,
      showGrandTotal: true,
      sortOrder,
    }),
  },

  metric: {
    count: (label: string = 'Count'): ReportMetric => ({
      id: `count_${Date.now()}`,
      fieldId: 'id',
      fieldPath: 'id',
      aggregate: 'COUNT',
      label,
    }),
    sum: (fieldId: string, label?: string): ReportMetric => ({
      id: `sum_${fieldId}`,
      fieldId,
      fieldPath: fieldId,
      aggregate: 'SUM',
      label: label || `Sum ${fieldId}`,
      format: 'NUMBER',
    }),
    avg: (fieldId: string, label?: string): ReportMetric => ({
      id: `avg_${fieldId}`,
      fieldId,
      fieldPath: fieldId,
      aggregate: 'AVG',
      label: label || `Avg ${fieldId}`,
      format: 'NUMBER',
    }),
    min: (fieldId: string, label?: string): ReportMetric => ({
      id: `min_${fieldId}`,
      fieldId,
      fieldPath: fieldId,
      aggregate: 'MIN',
      label: label || `Min ${fieldId}`,
    }),
    max: (fieldId: string, label?: string): ReportMetric => ({
      id: `max_${fieldId}`,
      fieldId,
      fieldPath: fieldId,
      aggregate: 'MAX',
      label: label || `Max ${fieldId}`,
    }),
  },

  chart: {
    bar: (xAxis: string, yAxis: string, groupBy?: string): ReportConfig['chartConfig'] => ({
      type: 'BAR',
      xAxis,
      yAxis,
      groupBy,
      showLegend: !!groupBy,
      showGrid: true,
    }),
    line: (xAxis: string, yAxis: string): ReportConfig['chartConfig'] => ({
      type: 'LINE',
      xAxis,
      yAxis,
      showLegend: false,
      showGrid: true,
    }),
    pie: (groupBy: string, valueField: string): ReportConfig['chartConfig'] => ({
      type: 'PIE',
      xAxis: groupBy,
      yAxis: valueField,
      showLegend: true,
      showGrid: false,
    }),
  },
};

// Migración para tabla de reportes
export const REPORTS_MIGRATION = `
-- Tabla de reportes personalizados
CREATE TABLE IF NOT EXISTS public.custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  is_public BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_account ON public.custom_reports(account_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_public ON public.custom_reports(account_id, is_public);

ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public reports from their account"
  ON public.custom_reports FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM public.profiles WHERE id = auth.uid())
    AND (is_public = true OR created_by = auth.uid())
  );

CREATE POLICY "Users can create reports in their account"
  ON public.custom_reports FOR INSERT
  WITH CHECK (account_id IN (SELECT account_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update their own reports"
  ON public.custom_reports FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own reports"
  ON public.custom_reports FOR DELETE
  USING (created_by = auth.uid());
`;
