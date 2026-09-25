// ============================================================
// GET    /api/v1/objects/{object}/records/{id} (scope: objects:read)
// PATCH  /api/v1/objects/{object}/records/{id} (scope: objects:write)
// DELETE /api/v1/objects/{object}/records/{id} (scope: objects:delete)
//
// PATCH MERGES into the stored field map: keys present in the
// request are written, keys absent are left alone. It does not
// replace the map. That matches how every other PATCH in this API
// behaves, and it is the only safe default — a replace would mean
// any client that round-trips a subset of fields silently wipes the
// rest.
//
// Writes go through `CustomRecordsManager` so the audit log gets
// its row; see the note in ../route.ts.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { readJsonBody } from '@/lib/api/v1/fields';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  resolveObject,
  serializeRecord,
  validateRecordFields,
} from '@/lib/api/v1/custom-objects';
import { createCustomRecordsManager } from '@/lib/objects/records';

type Params = { params: Promise<{ object: string; recordId: string }> };

/**
 * Read one record, scoped to BOTH the account and the object named
 * in the URL. Scoping to the object too means an id from a
 * different object can't be read through this path — the URL and
 * the row have to agree.
 */
async function readRecord(
  db: SupabaseClient,
  accountId: string,
  objectId: string,
  recordId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from('custom_object_records')
    .select('*')
    .eq('id', recordId)
    .eq('object_id', objectId)
    .eq('account_id', accountId)
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'objects:read');
    const { object, recordId } = await params;

    const resolved = await resolveObject(ctx.supabase, ctx.accountId, object);
    if (!resolved) return fail('not_found', `No object named '${object}'`, 404);

    const row = await readRecord(ctx.supabase, ctx.accountId, resolved.id, recordId);
    if (!row) return fail('not_found', 'Record not found', 404);

    return ok(serializeRecord(row, resolved.name));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'objects:write');
    const { object, recordId } = await params;
    const body = await readJsonBody(request);

    const resolved = await resolveObject(ctx.supabase, ctx.accountId, object);
    if (!resolved) return fail('not_found', `No object named '${object}'`, 404);

    const existing = await readRecord(ctx.supabase, ctx.accountId, resolved.id, recordId);
    if (!existing) return fail('not_found', 'Record not found', 404);

    const raw = 'fields' in body ? body.fields : body;
    const patch = validateRecordFields(resolved, raw, { partial: true });

    const merged = {
      ...((existing.fields as Record<string, unknown> | null) ?? {}),
      ...patch,
    };

    const userId = await resolveAuditUserId(ctx.supabase, ctx.accountId);
    const manager = createCustomRecordsManager(
      ctx.supabase,
      ctx.accountId,
      userId
    );

    const { record, error } = await manager.updateRecord(recordId, {
      fields: merged,
    });

    if (error || !record) {
      console.error('[api/v1/objects] record update error:', error);
      return fail('internal', 'Failed to update record', 500);
    }

    return ok({
      id: record.id,
      object: resolved.name,
      fields: record.fields,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'objects:delete');
    const { object, recordId } = await params;

    const resolved = await resolveObject(ctx.supabase, ctx.accountId, object);
    if (!resolved) return fail('not_found', `No object named '${object}'`, 404);

    // Confirm it exists under THIS object before deleting, so the
    // 404 is honest and the audit row names the right object.
    const existing = await readRecord(ctx.supabase, ctx.accountId, resolved.id, recordId);
    if (!existing) return fail('not_found', 'Record not found', 404);

    const userId = await resolveAuditUserId(ctx.supabase, ctx.accountId);
    const manager = createCustomRecordsManager(
      ctx.supabase,
      ctx.accountId,
      userId
    );

    const { success, error } = await manager.deleteRecord(recordId);
    if (!success) {
      console.error('[api/v1/objects] record delete error:', error);
      return fail('internal', 'Failed to delete record', 500);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
