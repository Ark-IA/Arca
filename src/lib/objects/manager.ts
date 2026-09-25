/**
 * Librería para gestión de Objetos Personalizados
 * CRUD para definiciones de objetos y campos
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ObjectDefinition, FieldDefinition, ViewDefinition, FieldType } from '@/types/objects';

/** El modismo del repo para sacar texto de algo que se atrapó en un catch. */
function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Filas tal como vuelven de PostgREST. Se escriben aquí en vez de
 * usar `any` para que un cambio de columna salga en el typecheck y no
 * en producción: estos mapeadores son el único punto donde el nombre
 * en snake_case de la base se traduce al camelCase del dominio, así
 * que es donde una columna renombrada tiene que doler.
 */
interface FilaDeObjeto {
  id: string;
  name_singular: string;
  name_plural: string;
  label_singular: string;
  label_plural: string;
  description?: string;
  icon: string;
  primary_field_id: string;
  default_view?: ObjectDefinition['defaultView'];
  permissions?: ObjectDefinition['permissions'];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FilaDeCampo {
  id: string;
  field_name: string;
  label: string;
  field_type: string;
  required: boolean;
  default_value?: unknown;
  description?: string;
  icon?: string;
  field_options?: FieldDefinition['options'];
  target_object?: string;
  position: number;
  visible_in_list: boolean;
  column_size?: FieldDefinition['columnSize'];
  is_system: boolean;
  is_active: boolean;
}

interface FilaDeVista {
  id: string;
  object_id: string;
  name: string;
  type: ViewDefinition['type'];
  filters?: ViewDefinition['filters'];
  sorts?: ViewDefinition['sorts'];
  columns?: ViewDefinition['columns'];
  kanban_field_id?: string;
  timeline_start_field_id?: string;
  timeline_end_field_id?: string;
  gallery_field_id?: string;
  is_default: boolean;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateObjectInput {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description?: string;
  icon: string;
  primaryFieldId: string;
  defaultView?: 'TABLE' | 'KANBAN' | 'TIMELINE' | 'GALLERY' | 'CALENDAR';
  fields?: CreateFieldInput[];
}

export interface CreateFieldInput {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
  icon?: string;
  options?: { id: string; label: string; color: string; position: number }[];
  targetObject?: string;
  position?: number;
  visibleInList?: boolean;
}

export interface UpdateObjectInput extends Partial<CreateObjectInput> {
  isActive?: boolean;
}

export class CustomObjectsManager {
  private supabase: SupabaseClient;
  private accountId: string;

  constructor(supabase: SupabaseClient, accountId: string) {
    this.supabase = supabase;
    this.accountId = accountId;
  }

  /**
   * Crear un nuevo objeto personalizado
   */
  async createObject(input: CreateObjectInput): Promise<{ object: ObjectDefinition | null; error: string | null }> {
    try {
      // Validar que el nombre singular no exista
      const { data: existing } = await this.supabase
        .from('custom_objects')
        .select('id')
        .eq('account_id', this.accountId)
        .eq('name_singular', input.nameSingular)
        .single();

      if (existing) {
        return { object: null, error: `Ya existe un objeto con nombre "${input.nameSingular}"` };
      }

      // Crear objeto
      const { data: objectData, error: objectError } = await this.supabase
        .from('custom_objects')
        .insert({
          account_id: this.accountId,
          name_singular: input.nameSingular,
          name_plural: input.namePlural,
          label_singular: input.labelSingular,
          label_plural: input.labelPlural,
          description: input.description,
          icon: input.icon,
          primary_field_id: input.primaryFieldId,
          default_view: input.defaultView || 'TABLE',
          is_system: false,
          is_active: true,
        })
        .select()
        .single();

      if (objectError) throw objectError;

      // Crear campos iniciales
      if (input.fields && input.fields.length > 0) {
        // `field_name`, `field_type` y `field_options` son los nombres que
        // ya tenía la tabla, que es compartida con los campos de contacto
        // y está en uso. Ver la migración 077.
        const fieldsToInsert = input.fields.map((field, index) => ({
          object_id: objectData.id,
          account_id: this.accountId,
          field_name: field.name,
          label: field.label,
          field_type: field.type,
          required: field.required || false,
          default_value: field.defaultValue ? JSON.stringify(field.defaultValue) : null,
          description: field.description,
          icon: field.icon,
          field_options: field.options ? JSON.stringify(field.options) : null,
          target_object: field.targetObject,
          position: field.position ?? index,
          visible_in_list: field.visibleInList ?? true,
          is_system: false,
          is_active: true,
        }));

        const { error: fieldsError } = await this.supabase
          .from('custom_fields')
          .insert(fieldsToInsert);

        if (fieldsError) throw fieldsError;
      }

      // Crear vista por defecto
      const { error: viewError } = await this.supabase
        .from('custom_views')
        .insert({
          object_id: objectData.id,
          account_id: this.accountId,
          name: 'All',
          type: input.defaultView || 'TABLE',
          is_default: true,
          position: 0,
          created_by: (await this.supabase.auth.getUser()).data.user?.id,
        });

      if (viewError) throw viewError;

      // Crear permisos por defecto para cada rol
      const roles = ['owner', 'admin', 'agent', 'viewer'];
      const permissionsToInsert = roles.map((role) => ({
        account_id: this.accountId,
        object_id: objectData.id,
        role,
        can_read: true,
        can_create: role === 'owner' || role === 'admin' || role === 'agent',
        can_update: role === 'owner' || role === 'admin' || role === 'agent',
        can_delete: role === 'owner' || role === 'admin',
        read_scope: 'ALL',
        create_scope: 'ALL',
        update_scope: role === 'agent' ? 'OWN' : 'ALL',
        delete_scope: role === 'agent' ? 'NONE' : (role === 'viewer' ? 'NONE' : 'ALL'),
      }));

      const { error: permError } = await this.supabase
        .from('object_permissions')
        .insert(permissionsToInsert);

      if (permError) throw permError;

      return { object: this.mapToObjectDefinition(objectData), error: null };
    } catch (error) {
      return { object: null, error: mensaje(error) };
    }
  }

  /**
   * Obtener todos los objetos de una cuenta
   */
  async getObjects(): Promise<ObjectDefinition[]> {
    const { data, error } = await this.supabase
      .from('custom_objects')
      .select('*')
      .eq('account_id', this.accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data.map(this.mapToObjectDefinition);
  }

  /**
   * Obtener un objeto específico con sus campos
   */
  async getObject(objectId: string): Promise<{ object: ObjectDefinition | null; error: string | null }> {
    const { data: objectData, error: objectError } = await this.supabase
      .from('custom_objects')
      .select('*')
      .eq('account_id', this.accountId)
      .eq('id', objectId)
      .single();

    if (objectError) {
      return { object: null, error: objectError.message };
    }

    const { data: fieldsData, error: fieldsError } = await this.supabase
      .from('custom_fields')
      .select('*')
      .eq('object_id', objectId)
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (fieldsError) {
      return { object: null, error: fieldsError.message };
    }

    const object = this.mapToObjectDefinition(objectData);
    object.fields = fieldsData.map(this.mapToFieldDefinition);

    return { object, error: null };
  }

  /**
   * Actualizar un objeto
   */
  async updateObject(objectId: string, input: UpdateObjectInput): Promise<{ success: boolean; error: string | null }> {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (input.nameSingular !== undefined) updateData.name_singular = input.nameSingular;
      if (input.namePlural !== undefined) updateData.name_plural = input.namePlural;
      if (input.labelSingular !== undefined) updateData.label_singular = input.labelSingular;
      if (input.labelPlural !== undefined) updateData.label_plural = input.labelPlural;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.icon !== undefined) updateData.icon = input.icon;
      if (input.primaryFieldId !== undefined) updateData.primary_field_id = input.primaryFieldId;
      if (input.defaultView !== undefined) updateData.default_view = input.defaultView;
      if (input.isActive !== undefined) updateData.is_active = input.isActive;

      const { error } = await this.supabase
        .from('custom_objects')
        .update(updateData)
        .eq('id', objectId)
        .eq('account_id', this.accountId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Eliminar un objeto (soft delete)
   */
  async deleteObject(objectId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('custom_objects')
        .update({ is_active: false })
        .eq('id', objectId)
        .eq('account_id', this.accountId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Añadir un campo a un objeto
   */
  async addField(objectId: string, input: CreateFieldInput): Promise<{ field: FieldDefinition | null; error: string | null }> {
    try {
      // Obtener el último position
      const { data: lastField } = await this.supabase
        .from('custom_fields')
        .select('position')
        .eq('object_id', objectId)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      const position = lastField ? lastField.position + 1 : 0;

      const { data, error } = await this.supabase
        .from('custom_fields')
        .insert({
          object_id: objectId,
          account_id: this.accountId,
          field_name: input.name,
          label: input.label,
          field_type: input.type,
          required: input.required || false,
          default_value: input.defaultValue ? JSON.stringify(input.defaultValue) : null,
          description: input.description,
          icon: input.icon,
          field_options: input.options ? JSON.stringify(input.options) : null,
          target_object: input.targetObject,
          position: input.position ?? position,
          visible_in_list: input.visibleInList ?? true,
          is_system: false,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      return { field: this.mapToFieldDefinition(data), error: null };
    } catch (error) {
      return { field: null, error: mensaje(error) };
    }
  }

  /**
   * Actualizar un campo
   */
  async updateField(fieldId: string, input: Partial<CreateFieldInput>): Promise<{ success: boolean; error: string | null }> {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (input.label !== undefined) updateData.label = input.label;
      if (input.type !== undefined) updateData.field_type = input.type;
      if (input.required !== undefined) updateData.required = input.required;
      if (input.defaultValue !== undefined) updateData.default_value = JSON.stringify(input.defaultValue);
      if (input.description !== undefined) updateData.description = input.description;
      if (input.icon !== undefined) updateData.icon = input.icon;
      if (input.options !== undefined) updateData.field_options = JSON.stringify(input.options);
      if (input.visibleInList !== undefined) updateData.visible_in_list = input.visibleInList;

      const { error } = await this.supabase
        .from('custom_fields')
        .update(updateData)
        .eq('id', fieldId)
        .eq('account_id', this.accountId)
        // The mirror of the filter every contact-field screen carries:
        // this table also holds contact fields (object_id NULL), and
        // this manager must never reach one. Retyping a contact field
        // from here would break the contact form that reads it.
        .not('object_id', 'is', null);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Eliminar un campo
   */
  async deleteField(fieldId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('custom_fields')
        .update({ is_active: false })
        .eq('id', fieldId)
        .eq('account_id', this.accountId)
        // Same reason as updateField: never deactivate a contact field
        // (object_id NULL) from the custom-objects side.
        .not('object_id', 'is', null);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Obtener vistas de un objeto
   */
  async getViews(objectId: string): Promise<ViewDefinition[]> {
    const { data, error } = await this.supabase
      .from('custom_views')
      .select('*')
      .eq('object_id', objectId)
      .eq('account_id', this.accountId)
      .order('position', { ascending: true });

    if (error) throw error;

    return data.map(this.mapToViewDefinition);
  }

  /**
   * Crear una vista
   */
  async createView(objectId: string, input: {
    name: string;
    type: 'TABLE' | 'KANBAN' | 'TIMELINE' | 'GALLERY' | 'CALENDAR';
    filters?: unknown[];
    sorts?: unknown[];
    columns?: string[];
    kanbanFieldId?: string;
  }): Promise<{ view: ViewDefinition | null; error: string | null }> {
    try {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      
      const { data, error } = await this.supabase
        .from('custom_views')
        .insert({
          object_id: objectId,
          account_id: this.accountId,
          name: input.name,
          type: input.type,
          filters: input.filters ? JSON.stringify(input.filters) : null,
          sorts: input.sorts ? JSON.stringify(input.sorts) : null,
          columns: input.columns ? JSON.stringify(input.columns) : null,
          kanban_field_id: input.kanbanFieldId,
          is_default: false,
          position: 0,
          created_by: userId,
          updated_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      return { view: this.mapToViewDefinition(data), error: null };
    } catch (error) {
      return { view: null, error: mensaje(error) };
    }
  }

  // Helpers de mapeo
  private mapToObjectDefinition(data: FilaDeObjeto): ObjectDefinition {
    return {
      id: data.id,
      nameSingular: data.name_singular,
      namePlural: data.name_plural,
      labelSingular: data.label_singular,
      labelPlural: data.label_plural,
      description: data.description,
      icon: data.icon,
      primaryFieldId: data.primary_field_id,
      fields: [],
      defaultView: data.default_view,
      permissions: data.permissions,
      isSystem: data.is_system,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapToFieldDefinition(data: FilaDeCampo): FieldDefinition {
    return {
      id: data.id,
      name: data.field_name,
      label: data.label,
      labelSingular: data.label,
      labelPlural: data.label,
      type: data.field_type as FieldType,
      required: data.required,
      defaultValue: data.default_value,
      description: data.description,
      icon: data.icon,
      options: data.field_options,
      targetObject: data.target_object,
      position: data.position,
      visibleInList: data.visible_in_list,
      columnSize: data.column_size,
      isSystem: data.is_system,
      isActive: data.is_active,
    };
  }

  private mapToViewDefinition(data: FilaDeVista): ViewDefinition {
    return {
      id: data.id,
      objectId: data.object_id,
      name: data.name,
      type: data.type,
      filters: data.filters,
      sorts: data.sorts,
      columns: data.columns,
      kanbanFieldId: data.kanban_field_id,
      timelineStartFieldId: data.timeline_start_field_id,
      timelineEndFieldId: data.timeline_end_field_id,
      galleryFieldId: data.gallery_field_id,
      isDefault: data.is_default,
      position: data.position,
      createdBy: data.created_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}

/**
 * Factory para crear el manager
 */
export function createCustomObjectsManager(
  supabase: SupabaseClient,
  accountId: string
): CustomObjectsManager {
  return new CustomObjectsManager(supabase, accountId);
}
