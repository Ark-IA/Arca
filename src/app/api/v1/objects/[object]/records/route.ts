// ============================================================
// GET  /api/v1/objects/{object}/records — list  (scope: objects:read)
// POST /api/v1/objects/{object}/records — create (scope: objects:write)
//
// One pair of handlers serving every custom object the account has
// defined. The object is resolved from the URL, its field list read
// from the metadata, and the payload validated against that.
//
// Filtering: `?where[<field>]=<value>` matches on a field's stored
// value, e.g. `?where[status]=open`. Values in the JSONB column are
// compared as text, which is what the `->>` operator yields.
//
// Writes go through `CustomRecordsManager` rather than a direct
// insert, because that is what writes the `field_audit_logs` row.
// An audit trail with holes in it wherever the API wrote is worse
// than no audit trail, because it looks complete.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams, buildPage, keysetFilter } from '@/lib/api/v1/pagination';
import { readJsonBody } from '@/lib/api/v1/fields';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  resolveObject,
  serializeRecord,
  validateRecordFields,
} from '@/lib/api/v1/custom-objects';
import { createCustomRecordsManager } from '@/lib/objects/records';

type Params = { params: Promise<{ object: string }> };

/** Pull `?where[field]=value` pairs off the URL. */
function parseWhere(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const match = /^where\[([a-zA-Z0-9_]+)\]$/.exec(key);
    if (match) out[match[1]] = value;
  }
  return out;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'objects:read');
    const { object } = await params;
    const { limit, cursor } = parseListParams(request);

    const resolved = await resolveObject(ctx.supabase, ctx.accountId, object);
    if (!resolved) return fail('not_found', `No object named '${object}'`, 404);

    // The list is built here rather than through the manager's
    // `queryRecords`, which pages by offset and addresses fields by
    // UUID. Both are at odds with this API: v1 pages by keyset
    // everywhere, and records are stored keyed by field NAME.
    let query = ctx.supabase
      .from('custom_object_records')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('object_id', resolved.id);

    const known = new Set(resolved.fields.map((f) => f.name));
    for (const [field, value] of Object.entries(parseWhere(new URL(request.url)))) {
      if (!known.has(field)) {
        return fail(
          'bad_request',
          `'${field}' is not a field on '${resolved.name}'`,
          400
        );
      }
      // `->>` compares the JSON value as text. The field name is
      // checked against the schema above, so it cannot smuggle
      // PostgREST syntax into the path.
      query = query.eq(`fields->>${field}`, value);
    }

    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    const kf = keysetFilter(cursor);
    if (kf) query = query.or(kf);

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/objects] record list error:', error);
      return fail('internal', 'Failed to list records', 500);
    }

    const { items, nextCursor } = buildPage(
      (data ?? []) as unknown as Array<{ created_at: string; id: string }>,
      limit
    );

    return okList(
      items.map((r) =>
        serializeRecord(r as unknown as Record<string, unknown>, resolved.name)
      ),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'objects:write');
    const { object } = await params;
    const body = await readJsonBody(request);

    const resolved = await resolveObject(ctx.supabase, ctx.accountId, object);
    if (!resolved) return fail('not_found', `No object named '${object}'`, 404);

    // Accept both `{ fields: {...} }` and a bare `{...}` of field
    // values. The nested form is the documented one; the flat form
    // is what people try first, and rejecting it would be pedantry.
    const raw = 'fields' in body ? body.fields : body;
    const fields = validateRecordFields(resolved, raw, { partial: false });

    const userId = await resolveAuditUserId(ctx.supabase, ctx.accountId);
    const manager = createCustomRecordsManager(
      ctx.supabase,
      ctx.accountId,
      userId
    );

    const { record, error } = await manager.createRecord({
      objectId: resolved.id,
      fields,
    });

    if (error || !record) {
      console.error('[api/v1/objects] record create error:', error);
      return fail('internal', 'Failed to create record', 500);
    }

    return ok(
      {
        id: record.id,
        object: resolved.name,
        fields: record.fields,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
      201
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
