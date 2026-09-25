// ============================================================
// GET    /api/v1/deals/{id} — read   (scope: deals:read)
// PATCH  /api/v1/deals/{id} — update (scope: deals:write)
// DELETE /api/v1/deals/{id} — remove (scope: deals:delete)
//
// Moving a deal across the board is a PATCH of `stage_id`. The
// stage is validated against the deal's CURRENT pipeline when the
// request doesn't also move it to another one — otherwise a deal
// could land on a stage that belongs to a different board and stop
// rendering in any column.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow, updateRow, deleteRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import {
  DEAL_SELECT,
  DEAL_FIELDS,
  serializeDeal,
  validateDealLinks,
} from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'deals:read');
    const { id } = await params;

    const row = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'deals',
      ctx.accountId,
      id,
      DEAL_SELECT
    );
    if (!row) return fail('not_found', 'Deal not found', 404);

    return ok(serializeDeal(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'deals:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, DEAL_FIELDS);

    const existing = await getRow<{ pipeline_id: string }>(
      ctx.supabase,
      'deals',
      ctx.accountId,
      id,
      'id, pipeline_id'
    );
    if (!existing) return fail('not_found', 'Deal not found', 404);

    const badLink = await validateDealLinks(
      ctx.supabase,
      ctx.accountId,
      updates,
      existing
    );
    if (badLink) return fail('bad_request', badLink, 400);

    // Changing pipelines without naming a stage would leave the deal
    // pointing at a stage on the old board. Refuse rather than pick
    // a stage on the caller's behalf — which stage a deal lands on
    // is a sales decision, not a default.
    if ('pipeline_id' in updates && !('stage_id' in updates)) {
      return fail(
        'bad_request',
        "Moving a deal to another pipeline requires a 'stage_id' on that pipeline",
        400
      );
    }

    const row = await updateRow<Record<string, unknown>>(
      ctx.supabase,
      'deals',
      ctx.accountId,
      id,
      updates,
      DEAL_SELECT
    );
    if (!row) return fail('not_found', 'Deal not found', 404);

    return ok(serializeDeal(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'deals:delete');
    const { id } = await params;

    const removed = await deleteRow(ctx.supabase, 'deals', ctx.accountId, id);
    if (!removed) return fail('not_found', 'Deal not found', 404);

    return new Response(null, { status: 204 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
