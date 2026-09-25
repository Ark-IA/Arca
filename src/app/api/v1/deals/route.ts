// ============================================================
// GET  /api/v1/deals — list deals  (scope: deals:read)
// POST /api/v1/deals — create a deal (scope: deals:write)
//
// Filters: `?pipeline_id=`, `?stage_id=`, `?status=` (open / won /
// lost), `?contact_id=`, `?assigned_to=` (a profile id) and
// `?search=` over the title.
//
// `deals.user_id` is NOT NULL from migration 001, and an API caller
// has no session — so writes are attributed through the same
// `resolveAuditUserId` every other public-API write uses, keeping a
// given key's rows attributed to one consistent human.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams } from '@/lib/api/v1/pagination';
import { listRows, insertRow, type BaseRow } from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  DEAL_SELECT,
  DEAL_FIELDS,
  serializeDeal,
  validateDealLinks,
} from '@/lib/api/v1/crm-resources';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'deals:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);

    const { items, nextCursor } = await listRows<BaseRow>(ctx.supabase, {
      table: 'deals',
      accountId: ctx.accountId,
      select: DEAL_SELECT,
      limit,
      cursor,
      eq: {
        pipeline_id: url.searchParams.get('pipeline_id'),
        stage_id: url.searchParams.get('stage_id'),
        status: url.searchParams.get('status'),
        contact_id: url.searchParams.get('contact_id'),
        assigned_to: url.searchParams.get('assigned_to'),
      },
      search: {
        term: url.searchParams.get('search') ?? '',
        columns: ['title'],
      },
    });

    return okList(
      items.map((r) => serializeDeal(r as unknown as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'deals:write');
    const body = await readJsonBody(request);
    const values = buildInsert(body, DEAL_FIELDS);

    const badLink = await validateDealLinks(
      ctx.supabase,
      ctx.accountId,
      values
    );
    if (badLink) return fail('bad_request', badLink, 400);

    values.user_id = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const row = await insertRow<Record<string, unknown>>(
      ctx.supabase,
      'deals',
      ctx.accountId,
      values,
      DEAL_SELECT
    );

    return ok(serializeDeal(row), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
