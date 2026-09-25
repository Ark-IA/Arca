// ============================================================
// GET /api/v1/objects/{object} — read one object's schema
//                                (scope: objects:read)
//
// Returns the object plus its active fields: name, label, type,
// whether it is required, and its options. This is what a client
// reads to know which keys a record's `fields` map accepts — and
// what an MCP client turns into a tool description at runtime.
//
// `{object}` is the object's `name` (its `name_singular`); its
// plural or its UUID also resolve. See lib/api/v1/custom-objects.ts.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  resolveObject,
  serializeObjectDetail,
} from '@/lib/api/v1/custom-objects';

type Params = { params: Promise<{ object: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'objects:read');
    const { object } = await params;

    const resolved = await resolveObject(ctx.supabase, ctx.accountId, object);
    if (!resolved) return fail('not_found', `No object named '${object}'`, 404);

    return ok(serializeObjectDetail(resolved.row, resolved.fields));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
