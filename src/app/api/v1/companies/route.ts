// ============================================================
// GET  /api/v1/companies — list companies  (scope: companies:read)
// POST /api/v1/companies — create a company (scope: companies:write)
//
// List is keyset-paginated like every other v1 collection and takes
// `?search=` (name or domain) and `?ideal=true` (the ICP filter the
// dashboard leads with). Create is a plain insert — unlike contacts
// there is no find-or-create, because a company's natural key is its
// domain and that is optional.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams } from '@/lib/api/v1/pagination';
import { listRows, insertRow, type BaseRow } from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import {
  COMPANY_SELECT,
  COMPANY_FIELDS,
  serializeCompany,
} from '@/lib/api/v1/crm-resources';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'companies:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);

    // `?ideal=true` narrows to the ICP set; any other value (or its
    // absence) means "no filter" rather than "ideal=false", so a
    // typo can't silently hide every ideal customer.
    const ideal = url.searchParams.get('ideal') === 'true' ? true : null;

    const { items, nextCursor } = await listRows<BaseRow>(ctx.supabase, {
      table: 'companies',
      accountId: ctx.accountId,
      select: COMPANY_SELECT,
      limit,
      cursor,
      eq: { is_ideal_customer: ideal },
      search: {
        term: url.searchParams.get('search') ?? '',
        columns: ['name', 'domain'],
      },
    });

    return okList(
      items.map((r) => serializeCompany(r as unknown as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'companies:write');
    const body = await readJsonBody(request);
    const values = buildInsert(body, COMPANY_FIELDS);

    const row = await insertRow<Record<string, unknown>>(
      ctx.supabase,
      'companies',
      ctx.accountId,
      values,
      COMPANY_SELECT
    );

    return ok(serializeCompany(row), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
