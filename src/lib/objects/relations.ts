/**
 * Librería para gestión de Relaciones entre Objetos
 * LOOKUP, MANY_TO_MANY, y ROLLUP fields
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** El modismo del repo para sacar texto de algo que se atrapó en un catch. */
function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface RelationDefinition {
  id: string;
  accountId: string;
  fromObjectId: string;
  toObjectId: string;
  relationType: 'LOOKUP' | 'MANY_TO_MANY';
  fromFieldId: string;
  toFieldId?: string; // Para relaciones bidireccionales
  isBidirectional: boolean;
  cascadeDelete: boolean;
}

/** Fila de `object_relations` tal como vuelve de PostgREST. */
interface FilaDeRelacion {
  id: string;
  account_id: string;
  from_object_id: string;
  to_object_id: string;
  relation_type: RelationDefinition['relationType'];
  from_field_id: string;
  to_field_id?: string;
  is_bidirectional: boolean;
  cascade_delete: boolean;
}

export interface CreateRelationInput {
  fromObjectId: string;
  toObjectId: string;
  relationType: 'LOOKUP' | 'MANY_TO_MANY';
  fromFieldName: string;
  toFieldName?: string; // Para relación inversa
  isBidirectional?: boolean;
  cascadeDelete?: boolean;
}

export interface RollupConfig {
  rollupFieldId: string;
  relationFieldId: string;
  targetFieldId: string;
  operation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
}

export class RelationManager {
  private supabase: SupabaseClient;
  private accountId: string;

  constructor(supabase: SupabaseClient, accountId: string) {
    this.supabase = supabase;
    this.accountId = accountId;
  }

  /**
   * Crear una relación entre objetos
   */
  async createRelation(input: CreateRelationInput): Promise<{ relation: RelationDefinition | null; error: string | null }> {
    try {
      // Validar que los objetos existan
      const { data: fromObject } = await this.supabase
        .from('custom_objects')
        .select('id')
        .eq('id', input.fromObjectId)
        .eq('account_id', this.accountId)
        .single();

      if (!fromObject) {
        return { relation: null, error: 'Objeto de origen no encontrado' };
      }

      const { data: toObject } = await this.supabase
        .from('custom_objects')
        .select('id')
        .eq('id', input.toObjectId)
        .eq('account_id', this.accountId)
        .single();

      if (!toObject) {
        return { relation: null, error: 'Objeto destino no encontrado' };
      }

      // Crear campo LOOKUP en el objeto de origen
      const { data: fromField, error: fieldError } = await this.supabase
        .from('custom_fields')
        .insert({
          object_id: input.fromObjectId,
          account_id: this.accountId,
          field_name: input.fromFieldName,
          label: input.fromFieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          field_type: input.relationType,
          target_object: input.toObjectId,
          required: false,
          visible_in_list: true,
          is_system: false,
          is_active: true,
          position: 0, // Se actualizará después
        })
        .select()
        .single();

      if (fieldError) {
        return { relation: null, error: fieldError.message };
      }

      // Crear registro de relación
      const { data: relationData, error: relationError } = await this.supabase
        .from('object_relations')
        .insert({
          account_id: this.accountId,
          from_object_id: input.fromObjectId,
          to_object_id: input.toObjectId,
          relation_type: input.relationType,
          from_field_id: fromField.id,
          to_field_id: null, // Se llena si es bidireccional
          is_bidirectional: input.isBidirectional || false,
          cascade_delete: input.cascadeDelete || false,
        })
        .select()
        .single();

      if (relationError) {
        // Rollback: eliminar el campo creado. Acotado por cuenta como
        // todos los borrados de este archivo, aunque el id sea uno que
        // acabamos de crear: un borrado sin filtro de cuenta es una
        // excepcion que luego alguien copia.
        await this.supabase
          .from('custom_fields')
          .delete()
          .eq('id', fromField.id)
          .eq('account_id', this.accountId);
        return { relation: null, error: relationError.message };
      }

      // Si es bidireccional, crear campo inverso
      let toField = null;
      if (input.isBidirectional && input.toFieldName) {
        const inverseType = input.relationType === 'LOOKUP' ? 'LOOKUP' : 'MANY_TO_MANY';
        
        const { data: inverseField, error: inverseFieldError } = await this.supabase
          .from('custom_fields')
          .insert({
            object_id: input.toObjectId,
            account_id: this.accountId,
            field_name: input.toFieldName,
            label: input.toFieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            field_type: inverseType,
            target_object: input.fromObjectId,
            required: false,
            visible_in_list: true,
            is_system: false,
            is_active: true,
            position: 0,
          })
          .select()
          .single();

        if (inverseFieldError) {
          // Rollback parcial
          await this.supabase
            .from('object_relations')
            .delete()
            .eq('id', relationData.id)
            .eq('account_id', this.accountId);
          await this.supabase
            .from('custom_fields')
            .delete()
            .eq('id', fromField.id)
            .eq('account_id', this.accountId);
          return { relation: null, error: inverseFieldError.message };
        }

        toField = inverseField;

        // Actualizar relación con to_field_id
        await this.supabase
          .from('object_relations')
          .update({ to_field_id: toField.id })
          .eq('id', relationData.id);
      }

      // Para MANY_TO_MANY, crear tabla intermedia
      if (input.relationType === 'MANY_TO_MANY') {
        // La tabla object_relation_records ya existe, solo necesitamos registrar la relación
        // Los registros se crearán dinámicamente
      }

      return { relation: this.mapToRelation(relationData), error: null };
    } catch (error) {
      return { relation: null, error: mensaje(error) };
    }
  }

  /**
   * Obtener relaciones de un objeto
   */
  async getObjectRelations(objectId: string): Promise<RelationDefinition[]> {
    const { data, error } = await this.supabase
      .from('object_relations')
      .select('*')
      .eq('account_id', this.accountId)
      .eq('from_object_id', objectId);

    if (error) throw error;

    return data.map(this.mapToRelation);
  }

  /**
   * Eliminar una relación
   */
  async deleteRelation(relationId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      // Obtener relación para cleanup.
      //
      // Acotado por cuenta: `relationId` entra por parámetro, y sin este
      // filtro bastaba con un id ajeno para que las dos eliminaciones de
      // abajo borraran campos de otra cuenta. Si no aparece, no hay nada
      // que limpiar y el borrado final tampoco tocará nada.
      const { data: relation } = await this.supabase
        .from('object_relations')
        .select('from_field_id, to_field_id')
        .eq('id', relationId)
        .eq('account_id', this.accountId)
        .maybeSingle();

      // Eliminar campos de relación.
      //
      // `custom_fields` guarda también los campos personalizados de los
      // contactos (object_id nulo, desde la migración 077). Exigir que
      // object_id tenga valor impide que una relación con datos
      // corrompidos se lleve por delante un campo de contacto.
      if (relation?.from_field_id) {
        await this.supabase
          .from('custom_fields')
          .delete()
          .eq('id', relation.from_field_id)
          .eq('account_id', this.accountId)
          .not('object_id', 'is', null);
      }
      if (relation?.to_field_id) {
        await this.supabase
          .from('custom_fields')
          .delete()
          .eq('id', relation.to_field_id)
          .eq('account_id', this.accountId)
          .not('object_id', 'is', null);
      }

      // Eliminar registros de relación many-to-many.
      //
      // `object_relation_records` lleva su propio account_id, así que
      // se acota igual: un relationId ajeno no debe poder vaciar los
      // vínculos de otra cuenta.
      await this.supabase
        .from('object_relation_records')
        .delete()
        .eq('relation_id', relationId)
        .eq('account_id', this.accountId);

      // Eliminar relación
      const { error } = await this.supabase
        .from('object_relations')
        .delete()
        .eq('id', relationId)
        .eq('account_id', this.accountId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Crear registro de relación (MANY_TO_MANY)
   */
  async createRelationRecord(relationId: string, fromRecordId: string, toRecordId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('object_relation_records')
        .insert({
          // La cuenta va explícita: es por donde filtra el RLS de la
          // tabla, que sin esta columna no tendría cómo aislar.
          account_id: this.accountId,
          relation_id: relationId,
          from_record_id: fromRecordId,
          to_record_id: toRecordId,
        });

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Eliminar registro de relación
   */
  async deleteRelationRecord(relationId: string, fromRecordId: string, toRecordId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('object_relation_records')
        .delete()
        .eq('relation_id', relationId)
        .eq('from_record_id', fromRecordId)
        .eq('to_record_id', toRecordId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Obtener registros relacionados
   */
  async getRelatedRecords(relationId: string, fromRecordId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('object_relation_records')
      .select('to_record_id')
      .eq('relation_id', relationId)
      .eq('from_record_id', fromRecordId);

    if (error) throw error;

    return data.map(r => r.to_record_id);
  }

  /**
   * Configurar campo ROLLUP
   */
  async configureRollup(config: RollupConfig): Promise<{ success: boolean; error: string | null }> {
    try {
      // Actualizar el campo rollup con la configuración
      const { error } = await this.supabase
        .from('custom_fields')
        .update({
          formula: JSON.stringify({
            type: 'ROLLUP',
            relationFieldId: config.relationFieldId,
            targetFieldId: config.targetFieldId,
            operation: config.operation,
          }),
        })
        .eq('id', config.rollupFieldId)
        .eq('account_id', this.accountId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Calcular valor ROLLUP para un registro
   */
  async calculateRollup(
    recordId: string,
    relationFieldId: string,
    targetFieldId: string,
    operation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX'
  ): Promise<unknown> {
    try {
      // Obtener el registro
      const { data: record } = await this.supabase
        .from('custom_object_records')
        .select('object_id, fields')
        .eq('id', recordId)
        .single();

      if (!record) return null;

      // Obtener definición del campo de relación para saber el objeto destino
      const { data: relationField } = await this.supabase
        .from('custom_fields')
        .select('target_object')
        .eq('id', relationFieldId)
        .single();

      if (!relationField) return null;

      // Obtener registros relacionados
      const relatedRecordId = record.fields[relationFieldId];
      if (!relatedRecordId) return null;

      const { data: relatedRecord } = await this.supabase
        .from('custom_object_records')
        .select('fields')
        .eq('id', relatedRecordId)
        .single();

      if (!relatedRecord) return null;

      const targetValue = relatedRecord.fields[targetFieldId];

      // Para operaciones que requieren array (COUNT, SUM, AVG, etc.)
      // En este caso simplificado, asumimos que es un LOOKUP simple
      // Para MANY_TO_MANY se necesitaría una consulta más compleja

      switch (operation) {
        case 'COUNT':
          return targetValue !== undefined ? 1 : 0;
        case 'SUM':
          return typeof targetValue === 'number' ? targetValue : 0;
        case 'AVG':
          return typeof targetValue === 'number' ? targetValue : 0;
        case 'MIN':
          return targetValue;
        case 'MAX':
          return targetValue;
        default:
          return null;
      }
    } catch (error) {
      console.error('Error calculating rollup:', error);
      return null;
    }
  }

  /**
   * Actualizar valores ROLLUP después de un cambio
   */
  async updateRollups(affectedRecordId: string, fieldId: string, newValue: unknown): Promise<void> {
    // Esta función se llamaría desde triggers o después de actualizaciones
    // Implementación simplificada - en producción se usarían triggers de DB
    
    // 1. Encontrar todos los campos rollup que dependen de este campo
    // 2. Recalcular sus valores
    // 3. Actualizar los registros afectados
  }

  // Helper de mapeo
  private mapToRelation(data: FilaDeRelacion): RelationDefinition {
    return {
      id: data.id,
      accountId: data.account_id,
      fromObjectId: data.from_object_id,
      toObjectId: data.to_object_id,
      relationType: data.relation_type,
      fromFieldId: data.from_field_id,
      toFieldId: data.to_field_id,
      isBidirectional: data.is_bidirectional,
      cascadeDelete: data.cascade_delete,
    };
  }
}

/**
 * Factory para crear el manager
 */
export function createRelationManager(
  supabase: SupabaseClient,
  accountId: string
): RelationManager {
  return new RelationManager(supabase, accountId);
}
