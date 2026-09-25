// ============================================================
// Shared logic for the generic custom-object endpoints.
//
// This is the piece that makes `/api/v1/objects/{object}/records`
// work for every custom object an account defines — present and
// future — instead of needing a hand-written route per object. It
// is the same trick Twenty uses: the metadata layer already
// describes the shape, so the endpoint reads the shape at request
// time rather than having it compiled in.
//
// ADDRESSING: an object is named in the URL by its `name_singular`
// (e.g. `/objects/project/records`), with its UUID accepted as an
// alternative. Names are what a human writes in a script and what
// stays readable in a log; the UUID is there for clients that
// already hold one. `name_plural` is accepted too, because guessing
// wrong about pluralisation is the most likely thing a caller does.
//
// FIELD KEYS: records store their values in a JSONB column keyed by
// field NAME — that is what the dashboard writes (`record.fields[
// field.name]` in dynamic-table.tsx) and therefore what is actually
// in the data. The public API speaks the same names, so a payload
// is readable without a lookup table of UUIDs.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type { FieldDefinition } from '@/types/objects';
import { badRequest } from './respond';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public shape of an object in a listing (no field detail). */
export interface ApiObjectSummary {
  id: string;
  name: string;
  name_plural: string;
  label: string;
  label_plural: string;
  description: string | null;
  icon: string;
  default_view: string | null;
  is_active: boolean;
  is_system: boolean;
}

/** A listing row plus its fields — what `GET /objects/{object}` returns. */
export interface ApiObjectDetail extends ApiObjectSummary {
  fields: {
    id: string;
    name: string;
    label: string;
    type: string;
    required: boolean;
    options: unknown;
    position: number | null;
  }[];
}

export interface ApiObjectRecord {
  id: string;
  object: string;
  fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function serializeObjectSummary(
  row: Record<string, unknown>
): ApiObjectSummary {
  return {
    id: row.id as string,
    name: row.name_singular as string,
    name_plural: row.name_plural as string,
    label: row.label_singular as string,
    label_plural: row.label_plural as string,
    description: (row.description as string | null) ?? null,
    icon: (row.icon as string | null) ?? 'Folder',
    default_view: (row.default_view as string | null) ?? null,
    is_active: row.is_active !== false,
    is_system: row.is_system === true,
  };
}

export function serializeObjectDetail(
  row: Record<string, unknown>,
  fields: FieldDefinition[]
): ApiObjectDetail {
  return {
    ...serializeObjectSummary(row),
    fields: fields.map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label,
      type: String(f.type),
      required: Boolean(f.required),
      options: f.options ?? null,
      position: f.position ?? null,
    })),
  };
}

export function serializeRecord(
  row: Record<string, unknown>,
  objectName: string
): ApiObjectRecord {
  return {
    id: row.id as string,
    object: objectName,
    fields: (row.fields as Record<string, unknown> | null) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** An object row plus its active fields, resolved once per request. */
export interface ResolvedObject {
  row: Record<string, unknown>;
  id: string;
  name: string;
  fields: FieldDefinition[];
}

/**
 * Look up an object by `name_singular`, `name_plural` or UUID,
 * scoped to the account. Returns null when there is no such object
 * here — the route turns that into a 404, so a caller cannot probe
 * which objects another tenant has defined.
 */
export async function resolveObject(
  db: SupabaseClient,
  accountId: string,
  ref: string
): Promise<ResolvedObject | null> {
  const decoded = decodeURIComponent(ref).trim();
  if (!decoded) return null;

  let query = db.from('custom_objects').select('*').eq('account_id', accountId);

  if (UUID_RE.test(decoded)) {
    query = query.eq('id', decoded);
  } else {
    // A name is a snake_case identifier. Anything else can't match a
    // row, and letting it through would interpolate caller text into
    // the PostgREST `.or()` grammar.
    if (!/^[a-z0-9_]{1,100}$/i.test(decoded)) return null;
    query = query.or(`name_singular.eq.${decoded},name_plural.eq.${decoded}`);
  }

  const { data: row, error } = await query.limit(1).maybeSingle();
  if (error || !row) return null;

  const { data: fieldRows } = await db
    .from('custom_fields')
    .select('*')
    .eq('object_id', row.id)
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  const fields: FieldDefinition[] = (fieldRows ?? []).map((f) => ({
    id: f.id,
    name: f.field_name,
    label: f.label,
    labelSingular: f.label,
    labelPlural: f.label,
    type: f.field_type,
    required: f.required,
    defaultValue: f.default_value,
    description: f.description,
    icon: f.icon,
    options: f.field_options,
    targetObject: f.target_object,
    position: f.position,
    visibleInList: f.visible_in_list,
    columnSize: f.column_size,
    isSystem: f.is_system,
    isActive: f.is_active,
  })) as FieldDefinition[];

  return {
    row,
    id: row.id as string,
    name: row.name_singular as string,
    fields,
  };
}

/**
 * Validate a caller-supplied `fields` payload against the object's
 * own definition, and return the map to store.
 *
 * Unknown field names are REJECTED rather than ignored. Everywhere
 * else in this API unknown keys are tolerated for forward
 * compatibility, but here the field set is the account's own schema:
 * a key that doesn't match one is a typo, and silently dropping it
 * would let an integration believe it is writing data that is going
 * nowhere. The error names the field and lists what exists.
 *
 * `partial` (a PATCH) skips the required-field check — the stored
 * row already satisfies it, and demanding every required field on
 * every update would make a one-field patch impossible.
 */
export function validateRecordFields(
  definition: ResolvedObject,
  input: unknown,
  { partial }: { partial: boolean }
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest("'fields' must be an object keyed by field name");
  }

  const supplied = input as Record<string, unknown>;
  const known = new Map(definition.fields.map((f) => [f.name, f]));

  for (const key of Object.keys(supplied)) {
    if (known.has(key)) continue;
    const available = definition.fields.map((f) => f.name).join(', ');
    throw badRequest(
      available
        ? `'${key}' is not a field on '${definition.name}'. Available: ${available}`
        : `'${definition.name}' has no fields defined yet`
    );
  }

  if (!partial) {
    for (const field of definition.fields) {
      if (!field.required) continue;
      const value = supplied[field.name];
      if (value === undefined || value === null || value === '') {
        throw badRequest(`'${field.name}' is required on '${definition.name}'`);
      }
    }
  }

  return supplied;
}
