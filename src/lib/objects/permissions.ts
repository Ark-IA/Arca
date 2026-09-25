/**
 * Librería para gestión de Permisos Granulares
 * Control de acceso por objeto, campo y acción
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** El modismo del repo para sacar texto de algo que se atrapó en un catch. */
function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type Role = 'owner' | 'admin' | 'agent' | 'viewer';
export type PermissionScope = 'ALL' | 'OWN' | 'TEAM' | 'NONE';
export type ActionType = 'read' | 'create' | 'update' | 'delete';

/** Fila de `object_permissions` tal como vuelve de PostgREST. */
interface FilaDePermiso {
  id: string;
  account_id: string;
  object_id: string;
  role: string;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  read_scope: PermissionScope;
  create_scope: PermissionScope;
  update_scope: PermissionScope;
  delete_scope: PermissionScope;
  // JSONB, no text[]: la columna guarda objetos `FieldPermission`
  // (`{ fieldId, canRead, canUpdate }`), no una lista de nombres.
  // Tiparlo como string[] compilaba y luego entregaba cadenas donde
  // el resto del codigo espera objetos.
  restricted_fields?: FieldPermission[];
}

export interface ObjectPermission {
  id: string;
  accountId: string;
  objectId: string;
  role: Role;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  readScope: PermissionScope;
  createScope: PermissionScope;
  updateScope: PermissionScope;
  deleteScope: PermissionScope;
  restrictedFields: FieldPermission[];
}

export interface FieldPermission {
  fieldId: string;
  canRead: boolean;
  canUpdate: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  restrictedFields?: string[];
}

export interface PermissionInput {
  role: Role;
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  readScope?: PermissionScope;
  createScope?: PermissionScope;
  updateScope?: PermissionScope;
  deleteScope?: PermissionScope;
  restrictedFields?: FieldPermission[];
}

export class PermissionManager {
  private supabase: SupabaseClient;
  private accountId: string;

  constructor(supabase: SupabaseClient, accountId: string) {
    this.supabase = supabase;
    this.accountId = accountId;
  }

  /**
   * Verificar si un usuario puede realizar una acción en un objeto
   */
  async checkPermission(
    objectId: string,
    userId: string,
    action: ActionType
  ): Promise<PermissionCheckResult> {
    try {
      // El perfil se busca por `user_id`, no por `id`: son dos UUID
      // distintos y el que devuelve auth es el primero. Y el rol que vale
      // es `account_role` — `role` es una columna de texto heredada.
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('id, account_role, account_id')
        .eq('user_id', userId)
        .single();

      if (!profile) {
        return { allowed: false, reason: 'Usuario no encontrado' };
      }

      // Owners y admins tienen acceso total
      if (profile.account_role === 'owner' || profile.account_role === 'admin') {
        return { allowed: true };
      }

      // Obtener permisos del objeto para este rol
      const { data: perm } = await this.supabase
        .from('object_permissions')
        .select('*')
        .eq('account_id', this.accountId)
        .eq('object_id', objectId)
        .eq('role', profile.account_role)
        .single();

      if (!perm) {
        // Si no hay permisos específicos, denegar por defecto
        return { allowed: false, reason: 'Sin permisos configurados' };
      }

      // Verificar permiso base
      const actionMap: Record<ActionType, { can: boolean; scope: PermissionScope }> = {
        read: { can: perm.can_read, scope: perm.read_scope },
        create: { can: perm.can_create, scope: perm.create_scope },
        update: { can: perm.can_update, scope: perm.update_scope },
        delete: { can: perm.can_delete, scope: perm.delete_scope },
      };

      const { can, scope } = actionMap[action];

      if (!can) {
        return { allowed: false, reason: `Acción ${action} no permitida para rol ${profile.account_role}` };
      }

      // Verificar scope
      if (scope !== 'ALL') {
        const scopeAllowed = await this.checkScope(scope, objectId, userId, action);
        if (!scopeAllowed) {
          return { 
            allowed: false, 
            reason: `Fuera del scope ${scope} para acción ${action}` 
          };
        }
      }

      // Obtener campos restringidos.
      //
      // La columna guarda lo que serializa updatePermissions(), que son
      // FieldPermission en camelCase. Acá se leían como `can_read` y
      // `can_update`, que en ese JSON no existen: la comprobación daba
      // siempre `!undefined`, o sea true, y restringía todos los campos.
      const restrictedFields = (perm.restricted_fields || [])
        .filter((f: FieldPermission) => {
          if (action === 'read') return !f.canRead;
          if (action === 'update') return !f.canUpdate;
          return false;
        })
        .map((f: FieldPermission) => f.fieldId);

      return {
        allowed: true,
        restrictedFields: restrictedFields.length > 0 ? restrictedFields : undefined,
      };
    } catch (error) {
      return { allowed: false, reason: mensaje(error) };
    }
  }

  /**
   * Verificar scope de permiso
   */
  private async checkScope(
    scope: PermissionScope,
    objectId: string,
    userId: string,
    action: ActionType
  ): Promise<boolean> {
    switch (scope) {
      case 'ALL':
        return true;

      case 'OWN': {
        // Las llaves no son decorativas: sin ellas, los `const` de este
        // case y los del siguiente caen en el mismo ámbito y chocan.
        const { data: record } = await this.supabase
          .from('custom_object_records')
          .select('created_by')
          .eq('id', objectId)
          .single();

        return record?.created_by === userId;
      }

      case 'TEAM':
        // No hay equipos todavía.
        //
        // Esto consultaba `profiles.team_id`, columna que no existe: la
        // consulta fallaba, el resultado venía vacío y el permiso salía
        // denegado igual, pero dejando un error en el camino. Mientras no
        // haya tabla de equipos, se deniega de frente. Cuando la haya,
        // acá va la comparación.
        return false;

      case 'NONE':
        return false;

      default:
        return false;
    }
  }

  /**
   * Verificar permisos para múltiples campos
   */
  async checkFieldPermissions(
    objectId: string,
    userId: string,
    fieldIds: string[],
    action: 'read' | 'update'
  ): Promise<{ allowed: string[]; denied: string[] }> {
    const result = await this.checkPermission(objectId, userId, action);
    
    if (!result.allowed) {
      return { allowed: [], denied: fieldIds };
    }

    const restricted = new Set(result.restrictedFields || []);
    
    return {
      allowed: fieldIds.filter(f => !restricted.has(f)),
      denied: fieldIds.filter(f => restricted.has(f)),
    };
  }

  /**
   * Filtrar campos de un registro según permisos
   */
  async filterFieldsByPermissions(
    objectId: string,
    userId: string,
    fields: Record<string, unknown>,
    action: 'read' | 'update'
  ): Promise<Record<string, unknown>> {
    const fieldIds = Object.keys(fields);
    const { allowed } = await this.checkFieldPermissions(objectId, userId, fieldIds, action);
    
    const filtered: Record<string, unknown> = {};
    for (const fieldId of allowed) {
      filtered[fieldId] = fields[fieldId];
    }
    
    return filtered;
  }

  /**
   * Obtener permisos de un objeto
   */
  async getObjectPermissions(objectId: string): Promise<ObjectPermission[]> {
    const { data, error } = await this.supabase
      .from('object_permissions')
      .select('*')
      .eq('account_id', this.accountId)
      .eq('object_id', objectId);

    if (error) throw error;

    return data.map(this.mapToPermission);
  }

  /**
   * Actualizar permisos de un objeto para un rol
   */
  async updatePermissions(
    objectId: string,
    role: Role,
    input: PermissionInput
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      // Verificar que el usuario actual sea owner o admin
      const { data: currentUser } = await this.supabase.auth.getUser();
      if (!currentUser.user) {
        return { success: false, error: 'No autorizado' };
      }

      const { data: profile } = await this.supabase
        .from('profiles')
        .select('account_role')
        .eq('user_id', currentUser.user.id)
        .single();

      if (profile?.account_role !== 'owner' && profile?.account_role !== 'admin') {
        return { success: false, error: 'Solo owners y admins pueden modificar permisos' };
      }

      const updateData: Record<string, unknown> = { ...input };
      if (input.restrictedFields) {
        updateData.restricted_fields = JSON.stringify(input.restrictedFields);
      }

      const { error } = await this.supabase
        .from('object_permissions')
        .update(updateData)
        .eq('account_id', this.accountId)
        .eq('object_id', objectId)
        .eq('role', role);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Inicializar permisos por defecto para un nuevo objeto
   */
  async initializeDefaultPermissions(objectId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const defaultPermissions = [
        {
          role: 'owner',
          can_read: true,
          can_create: true,
          can_update: true,
          can_delete: true,
          read_scope: 'ALL',
          create_scope: 'ALL',
          update_scope: 'ALL',
          delete_scope: 'ALL',
        },
        {
          role: 'admin',
          can_read: true,
          can_create: true,
          can_update: true,
          can_delete: true,
          read_scope: 'ALL',
          create_scope: 'ALL',
          update_scope: 'ALL',
          delete_scope: 'ALL',
        },
        {
          role: 'agent',
          can_read: true,
          can_create: true,
          can_update: true,
          can_delete: false,
          read_scope: 'ALL',
          create_scope: 'ALL',
          update_scope: 'OWN',
          delete_scope: 'NONE',
        },
        {
          role: 'viewer',
          can_read: true,
          can_create: false,
          can_update: false,
          can_delete: false,
          read_scope: 'ALL',
          create_scope: 'NONE',
          update_scope: 'NONE',
          delete_scope: 'NONE',
        },
      ];

      const permissionsToInsert = defaultPermissions.map(p => ({
        account_id: this.accountId,
        object_id: objectId,
        ...p,
        restricted_fields: [],
      }));

      const { error } = await this.supabase
        .from('object_permissions')
        .insert(permissionsToInsert);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: mensaje(error) };
    }
  }

  /**
   * Obtener el scope de un usuario para un objeto
   */
  async getUserScope(objectId: string, userId: string): Promise<{
    read: PermissionScope;
    create: PermissionScope;
    update: PermissionScope;
    delete: PermissionScope;
  }> {
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('account_role')
      .eq('user_id', userId)
      .single();

    if (!profile) {
      return { read: 'NONE', create: 'NONE', update: 'NONE', delete: 'NONE' };
    }

    // Owners y admins tienen ALL
    if (profile.account_role === 'owner' || profile.account_role === 'admin') {
      return { read: 'ALL', create: 'ALL', update: 'ALL', delete: 'ALL' };
    }

    const { data: perm } = await this.supabase
      .from('object_permissions')
      .select('read_scope, create_scope, update_scope, delete_scope')
      .eq('account_id', this.accountId)
      .eq('object_id', objectId)
      .eq('role', profile.account_role)
      .single();

    if (!perm) {
      return { read: 'NONE', create: 'NONE', update: 'NONE', delete: 'NONE' };
    }

    return {
      read: perm.read_scope,
      create: perm.create_scope,
      update: perm.update_scope,
      delete: perm.delete_scope,
    };
  }

  /**
   * Verificar si un usuario puede ver un registro específico
   */
  async canViewRecord(objectId: string, recordId: string, userId: string): Promise<boolean> {
    const permission = await this.checkPermission(objectId, userId, 'read');
    if (!permission.allowed) return false;

    // Si el scope es OWN, verificar si el usuario es el creador
    if (permission.reason?.includes('OWN')) {
      const { data: record } = await this.supabase
        .from('custom_object_records')
        .select('created_by')
        .eq('id', recordId)
        .single();

      return record?.created_by === userId;
    }

    return true;
  }

  /**
   * Verificar si un usuario puede editar un registro específico
   */
  async canEditRecord(objectId: string, recordId: string, userId: string): Promise<boolean> {
    const permission = await this.checkPermission(objectId, userId, 'update');
    if (!permission.allowed) return false;

    // Si el scope es OWN, verificar si el usuario es el creador
    if (permission.reason?.includes('OWN')) {
      const { data: record } = await this.supabase
        .from('custom_object_records')
        .select('created_by')
        .eq('id', recordId)
        .single();

      return record?.created_by === userId;
    }

    return true;
  }

  // Helper de mapeo
  private mapToPermission(data: FilaDePermiso): ObjectPermission {
    return {
      id: data.id,
      accountId: data.account_id,
      objectId: data.object_id,
      role: data.role as Role,
      canRead: data.can_read,
      canCreate: data.can_create,
      canUpdate: data.can_update,
      canDelete: data.can_delete,
      readScope: data.read_scope,
      createScope: data.create_scope,
      updateScope: data.update_scope,
      deleteScope: data.delete_scope,
      restrictedFields: data.restricted_fields || [],
    };
  }
}

/**
 * Factory para crear el manager
 */
export function createPermissionManager(
  supabase: SupabaseClient,
  accountId: string
): PermissionManager {
  return new PermissionManager(supabase, accountId);
}

/**
 * Hook helper para verificar permisos en componentes React
 */
export function createPermissionChecker(
  checkPermission: (objectId: string, action: ActionType) => Promise<PermissionCheckResult>
) {
  return {
    canRead: async (objectId: string) => {
      const result = await checkPermission(objectId, 'read');
      return result.allowed;
    },
    canCreate: async (objectId: string) => {
      const result = await checkPermission(objectId, 'create');
      return result.allowed;
    },
    canUpdate: async (objectId: string) => {
      const result = await checkPermission(objectId, 'update');
      return result.allowed;
    },
    canDelete: async (objectId: string) => {
      const result = await checkPermission(objectId, 'delete');
      return result.allowed;
    },
    canDo: async (objectId: string, action: ActionType) => {
      const result = await checkPermission(objectId, action);
      return result.allowed;
    },
  };
}
