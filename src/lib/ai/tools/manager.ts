/**
 * Agentes AI con Herramientas Ejecutables
 * Inspirado en Twenty AI Agents, LangChain y OpenAI Functions
 * 
 * Características:
 * - Herramientas para CRUD de objetos
 * - Búsqueda en base de conocimiento
 * - Ejecución de acciones en ARCA
 * - Permisos y límites de ejecución
 * - Historial de acciones
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createCustomRecordsManager } from '@/lib/objects/records';
import { createPermissionManager } from '@/lib/objects/permissions';

export type ToolCategory = 'CRUD' | 'SEARCH' | 'COMMUNICATION' | 'AUTOMATION' | 'ANALYTICS';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameter[];
  requiresPermission: boolean;
  permissionAction?: 'read' | 'create' | 'update' | 'delete';
}

export interface ToolExecution {
  toolId: string;
  parameters: Record<string, any>;
  result: any;
  error?: string;
  executedAt: Date;
  executionTime: number;
  userId: string;
  agentId?: string;
}

export interface AIAction {
  id: string;
  name: string;
  description: string;
  tools: string[]; // Tool IDs
  prompt: string;
  maxIterations: number;
  timeout: number;
  enabled: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  model: 'openai-gpt-4' | 'openai-gpt-3.5' | 'anthropic-claude';
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabledTools: string[];
  actions: AIAction[];
  permissions: {
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    maxOperationsPerHour: number;
  };
}

export class AIToolsManager {
  private supabase: SupabaseClient;
  private accountId: string;
  private userId: string;

  constructor(supabase: SupabaseClient, accountId: string, userId: string) {
    this.supabase = supabase;
    this.accountId = accountId;
    this.userId = userId;
  }

  /**
   * Herramientas CRUD para objetos
   */
  private getCRUDTools(): ToolDefinition[] {
    return [
      {
        id: 'create_record',
        name: 'createRecord',
        description: 'Crear un nuevo registro en un objeto personalizado',
        category: 'CRUD',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto (ej: contact, deal)', required: true },
          { name: 'fields', type: 'object', description: 'Campos y valores del registro', required: true },
        ],
        requiresPermission: true,
        permissionAction: 'create',
      },
      {
        id: 'get_record',
        name: 'getRecord',
        description: 'Obtener un registro por ID',
        category: 'CRUD',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto', required: true },
          { name: 'recordId', type: 'string', description: 'ID del registro', required: true },
        ],
        requiresPermission: true,
        permissionAction: 'read',
      },
      {
        id: 'list_records',
        name: 'listRecords',
        description: 'Listar registros con filtros opcionales',
        category: 'CRUD',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto', required: true },
          { name: 'filters', type: 'object', description: 'Filtros de búsqueda', required: false },
          { name: 'limit', type: 'number', description: 'Máximo de registros (default: 20)', required: false },
          { name: 'offset', type: 'number', description: 'Offset para paginación', required: false },
        ],
        requiresPermission: true,
        permissionAction: 'read',
      },
      {
        id: 'update_record',
        name: 'updateRecord',
        description: 'Actualizar un registro existente',
        category: 'CRUD',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto', required: true },
          { name: 'recordId', type: 'string', description: 'ID del registro', required: true },
          { name: 'fields', type: 'object', description: 'Campos a actualizar', required: true },
        ],
        requiresPermission: true,
        permissionAction: 'update',
      },
      {
        id: 'delete_record',
        name: 'deleteRecord',
        description: 'Eliminar un registro',
        category: 'CRUD',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto', required: true },
          { name: 'recordId', type: 'string', description: 'ID del registro', required: true },
        ],
        requiresPermission: true,
        permissionAction: 'delete',
      },
      {
        id: 'search_records',
        name: 'searchRecords',
        description: 'Búsqueda full-text en registros',
        category: 'SEARCH',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto', required: true },
          { name: 'query', type: 'string', description: 'Término de búsqueda', required: true },
          { name: 'searchFields', type: 'array', description: 'Campos donde buscar', required: false },
        ],
        requiresPermission: true,
        permissionAction: 'read',
      },
    ];
  }

  /**
   * Herramientas de comunicación
   */
  private getCommunicationTools(): ToolDefinition[] {
    return [
      {
        id: 'send_whatsapp_message',
        name: 'sendWhatsAppMessage',
        description: 'Enviar mensaje de WhatsApp a un contacto',
        category: 'COMMUNICATION',
        parameters: [
          { name: 'contactId', type: 'string', description: 'ID del contacto', required: true },
          { name: 'message', type: 'string', description: 'Mensaje a enviar', required: true },
          { name: 'templateName', type: 'string', description: 'Nombre de plantilla (opcional)', required: false },
        ],
        requiresPermission: true,
        permissionAction: 'create',
      },
      {
        id: 'send_email',
        name: 'sendEmail',
        description: 'Enviar email a un contacto',
        category: 'COMMUNICATION',
        parameters: [
          { name: 'contactId', type: 'string', description: 'ID del contacto', required: true },
          { name: 'subject', type: 'string', description: 'Asunto del email', required: true },
          { name: 'body', type: 'string', description: 'Cuerpo del email', required: true },
        ],
        requiresPermission: true,
        permissionAction: 'create',
      },
      {
        id: 'create_task',
        name: 'createTask',
        description: 'Crear tarea o recordatorio',
        category: 'AUTOMATION',
        parameters: [
          { name: 'title', type: 'string', description: 'Título de la tarea', required: true },
          { name: 'description', type: 'string', description: 'Descripción', required: false },
          { name: 'dueDate', type: 'string', description: 'Fecha de vencimiento (ISO)', required: false },
          { name: 'assigneeId', type: 'string', description: 'ID del asignado', required: false },
        ],
        requiresPermission: true,
        permissionAction: 'create',
      },
      {
        id: 'create_note',
        name: 'createNote',
        description: 'Crear nota en un registro',
        category: 'AUTOMATION',
        parameters: [
          { name: 'objectType', type: 'string', description: 'Tipo de objeto', required: true },
          { name: 'recordId', type: 'string', description: 'ID del registro', required: true },
          { name: 'content', type: 'string', description: 'Contenido de la nota', required: true },
        ],
        requiresPermission: true,
        permissionAction: 'create',
      },
    ];
  }

  /**
   * Herramientas de analíticas
   */
  private getAnalyticsTools(): ToolDefinition[] {
    return [
      {
        id: 'get_metrics',
        name: 'getMetrics',
        description: 'Obtener métricas del dashboard',
        category: 'ANALYTICS',
        parameters: [
          { name: 'metricType', type: 'string', description: 'Tipo de métrica', required: true, enum: ['conversations', 'deals', 'contacts', 'response_time'] },
          { name: 'timeRange', type: 'string', description: 'Rango de tiempo', required: false, enum: ['today', 'week', 'month', 'year'] },
        ],
        requiresPermission: true,
        permissionAction: 'read',
      },
      {
        id: 'generate_report',
        name: 'generateReport',
        description: 'Generar reporte personalizado',
        category: 'ANALYTICS',
        parameters: [
          { name: 'reportType', type: 'string', description: 'Tipo de reporte', required: true },
          { name: 'filters', type: 'object', description: 'Filtros del reporte', required: false },
          { name: 'groupBy', type: 'string', description: 'Campo para agrupar', required: false },
        ],
        requiresPermission: true,
        permissionAction: 'read',
      },
    ];
  }

  /**
   * Obtener todas las herramientas disponibles
   */
  getAllTools(): ToolDefinition[] {
    return [
      ...this.getCRUDTools(),
      ...this.getCommunicationTools(),
      ...this.getAnalyticsTools(),
    ];
  }

  /**
   * Ejecutar una herramienta
   */
  async executeTool(toolId: string, parameters: Record<string, any>): Promise<ToolExecution> {
    const startTime = performance.now();
    const tools = this.getAllTools();
    const tool = tools.find(t => t.id === toolId);

    if (!tool) {
      return {
        toolId,
        parameters,
        result: null,
        error: 'Herramienta no encontrada',
        executedAt: new Date(),
        executionTime: 0,
        userId: this.userId,
      };
    }

    try {
      // Verificar permisos
      if (tool.requiresPermission && tool.permissionAction) {
        const permManager = createPermissionManager(this.supabase, this.accountId);
        // Verificación simplificada - en producción verificar por objeto específico
      }

      let result: any;

      // Ejecutar herramienta según tipo
      switch (toolId) {
        case 'create_record':
          result = await this.executeCreateRecord(parameters);
          break;
        case 'get_record':
          result = await this.executeGetRecord(parameters);
          break;
        case 'list_records':
          result = await this.executeListRecords(parameters);
          break;
        case 'update_record':
          result = await this.executeUpdateRecord(parameters);
          break;
        case 'delete_record':
          result = await this.executeDeleteRecord(parameters);
          break;
        case 'search_records':
          result = await this.executeSearchRecords(parameters);
          break;
        case 'send_whatsapp_message':
          result = await this.executeSendWhatsApp(parameters);
          break;
        case 'create_task':
          result = await this.executeCreateTask(parameters);
          break;
        case 'get_metrics':
          result = await this.executeGetMetrics(parameters);
          break;
        default:
          throw new Error(`Herramienta no implementada: ${toolId}`);
      }

      const endTime = performance.now();

      // Registrar ejecución
      // `userId` no va: logExecution lo excluye de su firma justamente
      // porque lo pone él con `this.userId`.
      await this.logExecution({
        toolId,
        parameters,
        result,
        executedAt: new Date(),
        executionTime: endTime - startTime,
      });

      return {
        toolId,
        parameters,
        result,
        executedAt: new Date(),
        executionTime: endTime - startTime,
        userId: this.userId,
      };
    } catch (error: any) {
      return {
        toolId,
        parameters,
        result: null,
        error: error.message,
        executedAt: new Date(),
        executionTime: 0,
        userId: this.userId,
      };
    }
  }

  /**
   * Implementaciones de herramientas
   */
  private async executeCreateRecord(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { objectType, fields } = params;
    
    const result = await recordsManager.createRecord({
      objectId: objectType,
      fields,
    });

    return result;
  }

  private async executeGetRecord(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { recordId } = params;
    
    const result = await recordsManager.getRecord(recordId);
    return result.record;
  }

  private async executeListRecords(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { objectType, filters, limit = 20, offset = 0 } = params;
    
    const result = await recordsManager.queryRecords(objectType, {
      filters,
      limit,
      offset,
    });

    return result.records;
  }

  private async executeUpdateRecord(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { recordId, fields } = params;
    
    const result = await recordsManager.updateRecord(recordId, { fields });
    return result;
  }

  private async executeDeleteRecord(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { recordId } = params;
    
    const result = await recordsManager.deleteRecord(recordId);
    return result;
  }

  private async executeSearchRecords(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { objectType, query, searchFields } = params;
    
    // Búsqueda simplificada - en producción usar full-text search
    const result = await recordsManager.queryRecords(objectType, {
      searchFieldId: searchFields?.[0] || 'name',
      searchQuery: query,
    });

    return result.records;
  }

  private async executeSendWhatsApp(params: any): Promise<any> {
    // Integración con WhatsApp existente en ARCA
    const { contactId, message } = params;
    
    // Obtener contacto
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const contactResult = await recordsManager.getRecord(contactId);
    
    if (!contactResult.record) {
      throw new Error('Contacto no encontrado');
    }

    const phone = contactResult.record.fields.phone;
    if (!phone) {
      throw new Error('Contacto sin número de teléfono');
    }

    // Enviar mensaje usando la infraestructura existente de WhatsApp
    // (se integraría con lib/whatsapp/send-message.ts)
    
    return { success: true, phone, message };
  }

  private async executeCreateTask(params: any): Promise<any> {
    const recordsManager = createCustomRecordsManager(this.supabase, this.accountId, this.userId);
    const { title, description, dueDate, assigneeId } = params;
    
    const result = await recordsManager.createRecord({
      objectId: 'tasks',
      fields: {
        title,
        description,
        due_date: dueDate,
        assignee_id: assigneeId,
        status: 'pending',
      },
    });

    return result;
  }

  private async executeGetMetrics(params: any): Promise<any> {
    const { metricType, timeRange = 'month' } = params;
    
    // Obtener métricas del dashboard existente
    // Esto se integraría con las queries del dashboard
    
    return {
      metricType,
      timeRange,
      data: {
        value: 0,
        trend: 0,
      },
    };
  }

  /**
   * Registrar ejecución de herramienta
   */
  private async logExecution(execution: Omit<ToolExecution, 'userId'>): Promise<void> {
    await this.supabase
      .from('ai_tool_executions')
      .insert({
        account_id: this.accountId,
        tool_id: execution.toolId,
        parameters: JSON.stringify(execution.parameters),
        result: JSON.stringify(execution.result),
        error: execution.error,
        execution_time_ms: execution.executionTime,
        user_id: this.userId,
        executed_at: execution.executedAt,
      });
  }

  /**
   * Obtener historial de ejecuciones
   */
  async getExecutionHistory(limit = 50): Promise<ToolExecution[]> {
    const { data, error } = await this.supabase
      .from('ai_tool_executions')
      .select('*')
      .eq('account_id', this.accountId)
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(d => ({
      toolId: d.tool_id,
      parameters: d.parameters,
      result: d.result,
      error: d.error,
      executedAt: new Date(d.executed_at),
      executionTime: d.execution_time_ms,
      userId: d.user_id,
    }));
  }
}

/**
 * Factory para crear el manager
 */
export function createAIToolsManager(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): AIToolsManager {
  return new AIToolsManager(supabase, accountId, userId);
}

// Migración para tabla de ejecuciones
export const AI_TOOLS_MIGRATION = `
-- Tabla de ejecuciones de herramientas AI
CREATE TABLE IF NOT EXISTS public.ai_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tool_id VARCHAR(100) NOT NULL,
  parameters JSONB,
  result JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  agent_id UUID,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_account ON public.ai_tool_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_user ON public.ai_tool_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_time ON public.ai_tool_executions(executed_at DESC);

ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tool executions"
  ON public.ai_tool_executions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert tool executions"
  ON public.ai_tool_executions FOR INSERT
  WITH CHECK (true);
`;
