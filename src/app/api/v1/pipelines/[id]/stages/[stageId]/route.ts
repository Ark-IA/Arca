// ============================================================
// PATCH /api/v1/pipelines/{id}/stages/{stageId} — rename, recolour
//        or reorder a stage (scope: pipelines:write)
//
// No DELETE: `deals.stage_id` references this table with no ON
// DELETE action, so Postgres would reject the delete for any stage
// that still holds a deal — and offering an endpoint that fails
// exactly when it matters is worse than not offering it. Empty the
// column from the dashboard first.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import { STAGE_FIELDS } from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string; stageId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id, stageId } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, STAGE_FIELDS);

    // Resolve the parent through the account first — the stage
    // table has no account column of its own to filter on.
    const pipeline = await getRow<{ id: string }>(
      ctx.supabase,
      'pipelines',
      ctx.accountId,
      id,
      'id'
    );
    if (!pipeline) return fail('not_found', 'Pipeline not found', 404);

    if (Object.keys(updates).length === 0) {
      const { data } = await ctx.supabase
        .from('pipeline_stages')
        .select('id, name, position, color')
        .eq('id', stageId)
        .eq('pipeline_id', pipeline.id)
        .maybeSingle();

      if (!data) return fail('not_found', 'Stage not found', 404);
      return ok(data);
    }

    const { data, error } = await ctx.supabase
      .from('pipeline_stages')
      .update(updates)
      .eq('id', stageId)
      .eq('pipeline_id', pipeline.id)
      .select('id, name, position, color')
      .maybeSingle();

    if (error) {
      console.error('[api/v1/pipelines] stage update error:', error);
      return fail('internal', 'Failed to update stage', 500);
    }
    if (!data) return fail('not_found', 'Stage not found', 404);

    return ok(data);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
