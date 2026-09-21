/**
 * Librería para gestión de Registros de Objetos Personalizados
 * CRUD para datos de objetos dinámicos
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Filter, Sort, ObjectRecord, AuditLog } from '@/types/objects';

export interface CreateRecordInput {
  objectId: string;
  fields: Record<string, any>;
}

export interface UpdateRecordInput {
  fields: Record<string, any>;
}

export interface QueryOptions {
  filters?: Filter[];
  sorts?: Sort[];
  limit?: number;
  offset?: number;
  searchFieldId?: string;
  searchQuery?: string;
}

export class CustomRecordsManager {
  private supabase: SupabaseClient;
  private accountId: string;
  private userId: string;

  constructor(supabase: SupabaseClient, accountId: string, userId: string) {
    this.supabase = supabase;
    this.accountId = accountId;
    this.userId = userId;
  }

  /**
   * Crear un nuevo registro
   */
  async createRecord(input: CreateRecordInput): Promise<{ record: ObjectRecord | null; error: string | null }> {
    try {
      const { data, error } = await this.supabase
        .from('custom_object_records')
        .insert({
          object_id: input.objectId,
          account_id: this.accountId,
          fields: input.fields,
          created_by: this.userId,
          updated_by: this.userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Crear audit log
      await this.createAuditLog({
        objectId: input.objectId,
        recordId: data.id,
        action: 'CREATE',
        newValue: input.fields,
      });

      return { record: this.mapToRecord(data), error: null };
    } catch (error: any) {
      return { record: null, error: error.message };
    }
  }

  /**
   * Obtener un registro por ID
   */
  async getRecord(recordId: string): Promise<{ record: ObjectRecord | null; error: string | null }> {
    const { data, error } = await this.supabase
      .from('custom_object_records')
      .select('*')
      .eq('id', recordId)
      .eq('account_id', this.accountId)
      .single();

    if (error) {
      return { record: null, error: error.message };
    }

    return { record: this.mapToRecord(data), error: null };
  }

  /**
   * Consultar registros con filtros y ordenamiento
   */
  async queryRecords(objectId: string, options: QueryOptions = {}): Promise<{ records: ObjectRecord[]; total: number; error: string | null }> {
    try {
      // Query base.
      //
      // El tipo va suelto a propósito: abajo se le encadenan filtros en un
      // bucle reasignando `query`, y cada `.eq()` anida un tipo más. Con el
      // tipo completo, TypeScript se queda sin profundidad ("type
      // instantiation is excessively deep"). Los filtros que entran ya
      // vienen validados por `QueryOptions`.
      let query: any = this.supabase
        .from('custom_object_records')
        .select('*', { count: 'exact' })
        .eq('object_id', objectId)
        .eq('account_id', this.accountId);

      // Aplicar filtros
      if (options.filters && options.filters.length > 0) {
        for (const filter of options.filters) {
          const jsonPath = `fields.${filter.fieldId}`;
          
          switch (filter.operator) {
            case 'EQUALS':
              query = query.eq(jsonPath as any, filter.value);
              break;
            case 'NOT_EQUALS':
              query = query.neq(jsonPath as any, filter.value);
              break;
            case 'CONTAINS':
              query = query.like(jsonPath as any, `%${filter.value}%`);
              break;
            case 'IS_EMPTY':
              query = query.or(`${jsonPath}.is.null,${jsonPath}.eq.""`);
              break;
            case 'IS_NOT_EMPTY':
              query = query.not(jsonPath as any, 'is', null).neq(jsonPath as any, '');
              break;
            case 'IS_TRUE':
              query = query.eq(jsonPath as any, true);
              break;
            case 'IS_FALSE':
              query = query.eq(jsonPath as any, false);
              break;
            case 'GREATER_THAN':
              query = query.gt(jsonPath as any, filter.value);
              break;
            case 'LESS_THAN':
              query = query.lt(jsonPath as any, filter.value);
              break;
            // Agregar más operadores según sea necesario
          }
        }
      }

      // Búsqueda de texto
      if (options.searchFieldId && options.searchQuery) {
        query = query.like(`fields.${options.searchFieldId}` as any, `%${options.searchQuery}%`);
      }

      // Ordenamiento
      if (options.sorts && options.sorts.length > 0) {
        for (const sort of options.sorts) {
          const jsonPath = `fields.${sort.fieldId}`;
          query = query.order(jsonPath as any, { ascending: sort.direction === 'ASC' });
        }
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Paginación
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { 
        records: data.map(this.mapToRecord), 
        total: data.length, // Nota: count exact puede necesitar otro approach
        error: null 
      };
    } catch (error: any) {
      return { records: [], total: 0, error: error.message };
    }
  }

  /**
   * Actualizar un registro
   */
  async updateRecord(recordId: string, input: UpdateRecordInput): Promise<{ record: ObjectRecord | null; error: string | null }> {
    try {
      // Obtener registro actual para audit
      const { data: currentData } = await this.supabase
        .from('custom_object_records')
        .select('fields, object_id')
        .eq('id', recordId)
        .single();

      const { data, error } = await this.supabase
        .from('custom_object_records')
        .update({
          fields: input.fields,
          updated_by: this.userId,
        })
        .eq('id', recordId)
        .eq('account_id', this.accountId)
        .select()
        .single();

      if (error) throw error;

      // Crear audit log para cada campo cambiado
      if (currentData) {
        for (const [fieldId, newValue] of Object.entries(input.fields)) {
          const oldValue = currentData.fields?.[fieldId];
          if (oldValue !== newValue) {
            await this.createAuditLog({
              objectId: currentData.object_id,
              recordId,
              fieldId,
              action: 'UPDATE',
              oldValue,
              newValue,
            });
          }
        }
      }

      return { record: this.mapToRecord(data), error: null };
    } catch (error: any) {
      return { record: null, error: error.message };
    }
  }

  /**
   * Eliminar un registro
   */
  async deleteRecord(recordId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // Obtener object_id para audit
      const { data: recordData } = await this.supabase
        .from('custom_object_records')
        .select('object_id, fields')
        .eq('id', recordId)
        .single();

      const { error } = await this.supabase
        .from('custom_object_records')
        .delete()
        .eq('id', recordId)
        .eq('account_id', this.accountId);

      if (error) throw error;

      // Crear audit log
      if (recordData) {
        await this.createAuditLog({
          objectId: recordData.object_id,
          recordId,
          action: 'DELETE',
          oldValue: recordData.fields,
        });
      }

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk create
   */
  async bulkCreateRecords(objectId: string, records: CreateRecordInput[]): Promise<{ created: number; error: string | null }> {
    try {
      const recordsToInsert = records.map(r => ({
        object_id: objectId,
        account_id: this.accountId,
        fields: r.fields,
        created_by: this.userId,
        updated_by: this.userId,
      }));

      const { data, error } = await this.supabase
        .from('custom_object_records')
        .insert(recordsToInsert)
        .select('id');

      if (error) throw error;

      // Audit logs
      for (const record of records) {
        await this.createAuditLog({
          objectId,
          recordId: data?.find(r => r)?.id || '',
          action: 'CREATE',
          newValue: record.fields,
        });
      }

      return { created: data?.length || 0, error: null };
    } catch (error: any) {
      return { created: 0, error: error.message };
    }
  }

  /**
   * Bulk update
   */
  async bulkUpdateRecords(recordIds: string[], fields: Record<string, any>): Promise<{ updated: number; error: string | null }> {
    try {
      const { data, error } = await this.supabase
        .from('custom_object_records')
        .update({
          fields,
          updated_by: this.userId,
        })
        .in('id', recordIds)
        .eq('account_id', this.accountId)
        .select('id, object_id');

      if (error) throw error;

      // Audit logs
      for (const record of data || []) {
        for (const [fieldId, newValue] of Object.entries(fields)) {
          await this.createAuditLog({
            objectId: record.object_id,
            recordId: record.id,
            fieldId,
            action: 'UPDATE',
            newValue,
          });
        }
      }

      return { updated: data?.length || 0, error: null };
    } catch (error: any) {
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Bulk delete
   */
  async bulkDeleteRecords(recordIds: string[]): Promise<{ deleted: number; error: string | null }> {
    try {
      const { data, error } = await this.supabase
        .from('custom_object_records')
        .delete()
        .in('id', recordIds)
        .eq('account_id', this.accountId)
        .select('id, object_id');

      if (error) throw error;

      // Audit logs
      for (const record of data || []) {
        await this.createAuditLog({
          objectId: record.object_id,
          recordId: record.id,
          action: 'DELETE',
        });
      }

      return { deleted: data?.length || 0, error: null };
    } catch (error: any) {
      return { deleted: 0, error: error.message };
    }
  }

  /**
   * Obtener historial de auditoría de un registro
   */
  async getAuditHistory(recordId: string): Promise<AuditLog[]> {
    const { data, error } = await this.supabase
      .from('field_audit_logs')
      .select('*')
      .eq('record_id', recordId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    return data.map(this.mapToAuditLog);
  }

  /**
   * Obtener historial de auditoría por objeto
   */
  async getObjectAuditHistory(objectId: string, limit = 50): Promise<AuditLog[]> {
    const { data, error } = await this.supabase
      .from('field_audit_logs')
      .select('*')
      .eq('object_id', objectId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(this.mapToAuditLog);
  }

  /**
   * Crear entrada de audit log
   */
  private async createAuditLog(input: {
    objectId: string;
    recordId: string;
    fieldId?: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    oldValue?: any;
    newValue?: any;
  }): Promise<void> {
    await this.supabase
      .from('field_audit_logs')
      .insert({
        account_id: this.accountId,
        object_id: input.objectId,
        record_id: input.recordId,
        field_id: input.fieldId,
        field_name: input.fieldId,
        action: input.action,
        old_value: input.oldValue ? JSON.stringify(input.oldValue) : null,
        new_value: input.newValue ? JSON.stringify(input.newValue) : null,
        user_id: this.userId,
        timestamp: new Date().toISOString(),
      });
  }

  /**
   * Obtener registros relacionados (para relaciones LOOKUP)
   */
  async getRelatedRecords(objectId: string, fieldId: string, recordId: string): Promise<ObjectRecord[]> {
    const { data, error } = await this.supabase
      .from('custom_object_records')
      .select('*')
      .eq('account_id', this.accountId)
      .eq(`fields.${fieldId}`, recordId);

    if (error) throw error;

    return data.map(this.mapToRecord);
  }

  // Helper de mapeo
  private mapToRecord(data: any): ObjectRecord {
    return {
      id: data.id,
      objectId: data.object_id,
      accountId: data.account_id,
      fields: data.fields || {},
      createdBy: data.created_by,
      updatedBy: data.updated_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapToAuditLog(data: any): AuditLog {
    return {
      id: data.id,
      accountId: data.account_id,
      objectId: data.object_id,
      recordId: data.record_id,
      fieldId: data.field_id,
      action: data.action as any,
      oldValue: data.old_value,
      newValue: data.new_value,
      userId: data.user_id,
      timestamp: new Date(data.timestamp),
      metadata: data.metadata,
    };
  }
}

/**
 * Factory para crear el manager
 */
export function createCustomRecordsManager(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): CustomRecordsManager {
  return new CustomRecordsManager(supabase, accountId, userId);
}
