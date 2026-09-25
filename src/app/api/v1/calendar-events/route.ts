// ============================================================
// GET  /api/v1/calendar-events — list  (scope: calendar:read)
// POST /api/v1/calendar-events — create (scope: calendar:write)
//
// Filters: `?from=` / `?to=` (ISO instants bounding `starts_at`),
// `?status=`, and `?contact_id=` / `?company_id=` / `?deal_id=`.
//
// NOTE ON ORDERING — like every v1 collection this pages newest-
// CREATED first, not soonest-starting, because the keyset cursor
// contract is `(created_at, id)` across the whole API and a
// per-resource ordering would need its own cursor format. To render
// an agenda, bound the window with `?from`/`?to` and sort by
// `starts_at` client-side; the window is what keeps that cheap.
//
// `meeting_url` is a plain link the caller supplies. Nothing here
// talks to Google Meet or Teams — see docs/public-api.md.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams } from '@/lib/api/v1/pagination';
import { listRows, insertRow, type BaseRow } from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import {
  CALENDAR_SELECT,
  CALENDAR_FIELDS,
  serializeCalendarEvent,
  validateEventWindow,
  validateEventLinks,
} from '@/lib/api/v1/crm-resources';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'calendar:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);

    const { items, nextCursor } = await listRows<BaseRow>(ctx.supabase, {
      table: 'calendar_events',
      accountId: ctx.accountId,
      select: CALENDAR_SELECT,
      limit,
      cursor,
      eq: {
        status: url.searchParams.get('status'),
        contact_id: url.searchParams.get('contact_id'),
        company_id: url.searchParams.get('company_id'),
        deal_id: url.searchParams.get('deal_id'),
      },
      gte: { starts_at: url.searchParams.get('from') },
      lte: { starts_at: url.searchParams.get('to') },
    });

    return okList(
      items.map((r) =>
        serializeCalendarEvent(r as unknown as Record<string, unknown>)
      ),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'calendar:write');
    const body = await readJsonBody(request);
    const values = buildInsert(body, CALENDAR_FIELDS);

    const badWindow = validateEventWindow(values.starts_at, values.ends_at);
    if (badWindow) return fail('bad_request', badWindow, 400);

    const badLink = await validateEventLinks(
      ctx.supabase,
      ctx.accountId,
      values
    );
    if (badLink) return fail('bad_request', badLink, 400);

    const row = await insertRow<Record<string, unknown>>(
      ctx.supabase,
      'calendar_events',
      ctx.accountId,
      values,
      CALENDAR_SELECT
    );

    return ok(serializeCalendarEvent(row), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
