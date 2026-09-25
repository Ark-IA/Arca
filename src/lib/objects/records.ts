/**
 * Librería para gestión de Registros de Objetos Personalizados
 * CRUD para datos de objetos dinámicos
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Filter, Sort, ObjectRecord, AuditLog } from '@/types/objects';

/** El modismo del repo para sacar texto de algo que se atrapó en un catch. */
function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fila de `custom_object_records` tal como vuelve de PostgREST. */
interface FilaDeRegistro {
  id: string;
  object_id: string;
  account_id: string;
  fields: Record<string, unknown> | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

/** Fila de `field_audit_logs`. */
interface FilaDeAuditoria {
  id: string;
  account_id: string;
  object_id: string;
  record_id: string;
  field_id?: string;
  action: AuditLog['action'];
  old_value?: unknown;
  new_value?: unknown;
  user_id: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface CreateRecordInput {
  objectId: string;
  fields: Record<string, unknown>;
}

export interface UpdateRecordInput {
  fields: Record<string, unknown>;
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
    } catch (error) {
      return { record: null, error: mensaje(error) };
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
   * Traduce la referencia a un campo (su id o su nombre) a la clave con
   * la que el registro está realmente guardado.
   *
   * Los valores viven en la columna JSONB `fields`, **indexados por
   * nombre**: es lo que escribe el formulario y lo que lee la tabla
   * (`record.fields[field.name]` en `dynamic-table.tsx`). Durante un
   * tiempo esta consulta armó la ruta con el id del campo, así que
   * ningún filtro podía coincidir jamás — devolvía cero resultados sin
   * error, que es la forma más incómoda de fallar.
   *
   * Acepta las dos formas porque las dos circulan: las vistas guardadas
   * en `custom_views.filters` traen ids, y `custom_objects
   * .primary_field_id` (un VARCHAR, no una FK) trae a veces el nombre.
   */
  private async resolveFieldKey(objectId: string): Promise<(ref: string) => string | null> {
    const { data } = await this.supabase
      .from('custom_fields')
      .select('id, field_name')
      .eq('object_id', objectId)
      .eq('account_id', this.accountId);

    const porId = new Map<string, string>();
    const nombres = new Set<string>();
    for (const f of data ?? []) {
      porId.set(f.id as string, f.field_name as string);
      nombres.add(f.field_name as string);
    }

    return (ref: string) => {
      const nombre = porId.get(ref) ?? (nombres.has(ref) ? ref : null);
      // La clave se interpola cruda en la gramática de PostgREST, así
      // que sólo pasa si además es un identificador. Un campo que no
      // existe devuelve null y quien llama omite el filtro, en vez de
      // armar una ruta inválida que tumbaría la consulta entera.
      if (!nombre || !/^[a-zA-Z0-9_]+$/.test(nombre)) return null;
      return nombre;
    };
  }

  /**
   * Consultar registros con filtros y ordenamiento
   */
  async queryRecords(objectId: string, options: QueryOptions = {}): Promise<{ records: ObjectRecord[]; total: number; error: string | null }> {
    try {
      const claveDe = await this.resolveFieldKey(objectId);

      // Query base.
      //
      // El tipo va suelto a propósito: abajo se le encadenan filtros en un
      // bucle reasignando `query`, y cada `.eq()` anida un tipo más. Con el
      // tipo completo, TypeScript se queda sin profundidad ("type
      // instantiation is excessively deep"). Los filtros que entran ya
      // vienen validados por `QueryOptions`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver el comentario de arriba: el tipo completo agota la profundidad de instanciacion de TypeScript
      let query: any = this.supabase
        .from('custom_object_records')
        .select('*', { count: 'exact' })
        .eq('object_id', objectId)
        .eq('account_id', this.accountId);

      // Aplicar filtros.
      //
      // La ruta es `fields->>clave`, que extrae el valor como TEXTO. La
      // forma anterior, `fields.clave`, no es una ruta JSONB para
      // PostgREST sino la sintaxis de recurso embebido: no filtraba por
      // el contenido del JSON.
      //
      // Al comparar como texto, GREATER_THAN y LESS_THAN ordenan
      // lexicográficamente, no numéricamente ("9" > "10"). Sirve para
      // fechas ISO, que ordenan igual como texto; para números hace
      // falta castear, y eso pide un RPC porque PostgREST no permite
      // castear en el lado izquierdo de un filtro.
      if (options.filters && options.filters.length > 0) {
        for (const filter of options.filters) {
          const clave = claveDe(filter.fieldId);
          if (!clave) continue;
          const jsonPath = `fields->>${clave}`;

          switch (filter.operator) {
            case 'EQUALS':
              query = query.eq(jsonPath, filter.value);
              break;
            case 'NOT_EQUALS':
              query = query.neq(jsonPath, filter.value);
              break;
            case 'CONTAINS':
              query = query.ilike(jsonPath, `%${filter.value}%`);
              break;
            case 'IS_EMPTY':
              query = query.or(`${jsonPath}.is.null,${jsonPath}.eq.`);
              break;
            case 'IS_NOT_EMPTY':
              query = query.not(jsonPath, 'is', null).neq(jsonPath, '');
              break;
            // `->>` devuelve texto, así que un booleano del JSON llega
            // como 'true' / 'false', no como true / false.
            case 'IS_TRUE':
              query = query.eq(jsonPath, 'true');
              break;
            case 'IS_FALSE':
              query = query.eq(jsonPath, 'false');
              break;
            case 'GREATER_THAN':
              query = query.gt(jsonPath, filter.value);
              break;
            case 'LESS_THAN':
              query = query.lt(jsonPath, filter.value);
              break;
            // Agregar más operadores según sea necesario
          }
        }
      }

      // Búsqueda de texto. `ilike` y no `like`: quien busca "acme" espera
      // encontrar "Acme".
      if (options.searchFieldId && options.searchQuery) {
        const clave = claveDe(options.searchFieldId);
        if (clave) {
          query = query.ilike(`fields->>${clave}`, `%${options.searchQuery}%`);
        }
      }

      // Ordenamiento
      if (options.sorts && options.sorts.length > 0) {
        for (const sort of options.sorts) {
          const clave = claveDe(sort.fieldId);
          if (!clave) continue;
          query = query.order(`fields->>${clave}`, { ascending: sort.direction === 'ASC' });
        }
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Paginación. `range` ya acota el tamaño, así que aplicar también
      // `limit` sería redundante y dejaría los dos caminos pudiendo
      // discrepar.
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      } else if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        records: (data ?? []).map(this.mapToRecord),
        // `count: 'exact'` ya viene pedido arriba: es el total que
        // cumple el filtro, no el tamaño de esta página. Devolver
        // `data.length` hacía que el total nunca pasara del límite, así
        // que cualquier paginador construido encima creía que sólo
        // había una página.
        total: count ?? (data ?? []).length,
        error: null
      };
    } catch (error) {
      return { records: [], total: 0, error: mensaje(error) };
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
    } catch (error) {
      return { record: null, error: mensaje(error) };
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
    } catch (error) {
      return { success: false, error: mensaje(error) };
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
    } catch (error) {
      return { created: 0, error: mensaje(error) };
    }
  }

  /**
   * Bulk update
   */
  async bulkUpdateRecords(recordIds: string[], fields: Record<string, unknown>): Promise<{ updated: number; error: string | null }> {
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
    } catch (error) {
      return { updated: 0, error: mensaje(error) };
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
    } catch (error) {
      return { deleted: 0, error: mensaje(error) };
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
    oldValue?: unknown;
    newValue?: unknown;
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
  private mapToRecord(data: FilaDeRegistro): ObjectRecord {
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

  private mapToAuditLog(data: FilaDeAuditoria): AuditLog {
    return {
      id: data.id,
      accountId: data.account_id,
      objectId: data.object_id,
      recordId: data.record_id,
      fieldId: data.field_id,
      action: data.action,
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
