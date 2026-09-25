// ============================================================
// GET   /api/v1/pipelines/{id} — read a board and its stages
//                                (scope: pipelines:read)
// PATCH /api/v1/pipelines/{id} — rename it (scope: pipelines:write)
//
// No DELETE — see the note in ../route.ts. `pipelines` predates the
// `updated_at` convention (migration 001), so the update skips the
// timestamp stamp.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow, updateRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import {
  PIPELINE_SELECT,
  PIPELINE_FIELDS,
  serializePipeline,
} from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:read');
    const { id } = await params;

    const row = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'pipelines',
      ctx.accountId,
      id,
      PIPELINE_SELECT
    );
    if (!row) return fail('not_found', 'Pipeline not found', 404);

    return ok(serializePipeline(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'pipelines:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, PIPELINE_FIELDS);

    const row = await updateRow<Record<string, unknown>>(
      ctx.supabase,
      'pipelines',
      ctx.accountId,
      id,
      updates,
      PIPELINE_SELECT,
      { touch: false }
    );
    if (!row) return fail('not_found', 'Pipeline not found', 404);

    return ok(serializePipeline(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
