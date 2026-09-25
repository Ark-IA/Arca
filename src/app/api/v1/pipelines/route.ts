// ============================================================
// GET  /api/v1/pipelines — list boards with their stages
//                          (scope: pipelines:read)
// POST /api/v1/pipelines — create a board, optionally with its
//                          stages in one call (scope: pipelines:write)
//
// There is deliberately no DELETE on this resource. `deals.pipeline_id`
// is ON DELETE CASCADE, so dropping a board silently destroys every
// deal on it — an outcome that should require a human looking at a
// warning, not an API key with a typo in a script. Archive by
// emptying the board instead. See docs/public-api.md.
//
// `pipelines.user_id` is NOT NULL from migration 001, so writes are
// attributed through the shared `resolveAuditUserId`.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams } from '@/lib/api/v1/pagination';
import { listRows, insertRow, getRow, type BaseRow } from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  PIPELINE_SELECT,
  PIPELINE_FIELDS,
  STAGE_FIELDS,
  serializePipeline,
} from '@/lib/api/v1/crm-resources';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { limit, cursor } = parseListParams(request);

    const { items, nextCursor } = await listRows<BaseRow>(ctx.supabase, {
      table: 'pipelines',
      accountId: ctx.accountId,
      select: PIPELINE_SELECT,
      limit,
      cursor,
    });

    return okList(
      items.map((r) =>
        serializePipeline(r as unknown as Record<string, unknown>)
      ),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const body = await readJsonBody(request);
    const values = buildInsert(body, PIPELINE_FIELDS);

    // Stages may come along in the same request. A board with no
    // stages holds no deals, so making the caller round-trip twice
    // just to get a usable board would be a papercut on every
    // integration that provisions one.
    const rawStages = body.stages;
    if (rawStages !== undefined && !Array.isArray(rawStages)) {
      return fail('bad_request', "'stages' must be an array", 400);
    }

    const stages: Record<string, unknown>[] = [];
    for (const [index, entry] of (rawStages ?? []).entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return fail(
          'bad_request',
          'Each entry in "stages" must be an object',
          400
        );
      }
      const stage = buildInsert(entry as Record<string, unknown>, STAGE_FIELDS);
      // Default the ordering to the order they were sent — writing
      // them in that order is what the caller meant by it.
      if (stage.position == null) stage.position = index;
      stages.push(stage);
    }

    values.user_id = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const pipeline = await insertRow<{ id: string }>(
      ctx.supabase,
      'pipelines',
      ctx.accountId,
      values,
      'id'
    );

    if (stages.length > 0) {
      const { error } = await ctx.supabase
        .from('pipeline_stages')
        .insert(stages.map((s) => ({ ...s, pipeline_id: pipeline.id })));

      if (error) {
        console.error('[api/v1/pipelines] stage insert error:', error);
        return fail(
          'internal',
          'Pipeline created but its stages could not be added',
          500
        );
      }
    }

    const created = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'pipelines',
      ctx.accountId,
      pipeline.id,
      PIPELINE_SELECT
    );

    return ok(serializePipeline(created ?? {}), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
