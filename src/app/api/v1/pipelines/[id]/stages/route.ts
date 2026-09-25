// ============================================================
// POST /api/v1/pipelines/{id}/stages — add a stage to a board
//                                      (scope: pipelines:write)
//
// `pipeline_stages` has no `account_id` of its own — it inherits
// scope from its pipeline. So the parent is resolved and verified
// against the caller's account FIRST, and every stage query hangs
// off that verified id. Querying stages directly by id would have
// no account filter to apply.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow } from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import { STAGE_FIELDS } from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const values = buildInsert(body, STAGE_FIELDS);

    const pipeline = await getRow<{ id: string }>(
      ctx.supabase,
      'pipelines',
      ctx.accountId,
      id,
      'id'
    );
    if (!pipeline) return fail('not_found', 'Pipeline not found', 404);

    // Unspecified position means "last". Reading the current max is
    // a race with a concurrent add, but the consequence is two
    // stages sharing a position and rendering in an arbitrary order
    // relative to each other — not data loss — and the caller can
    // fix it with a PATCH. Serialising every stage insert behind a
    // lock would be a steep price for that.
    if (values.position == null) {
      const { data: last } = await ctx.supabase
        .from('pipeline_stages')
        .select('position')
        .eq('pipeline_id', pipeline.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      values.position = last ? Number(last.position) + 1 : 0;
    }

    const { data, error } = await ctx.supabase
      .from('pipeline_stages')
      .insert({ ...values, pipeline_id: pipeline.id })
      .select('id, name, position, color')
      .single();

    if (error) {
      console.error('[api/v1/pipelines] stage create error:', error);
      return fail('internal', 'Failed to create stage', 500);
    }

    return ok(data, 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
