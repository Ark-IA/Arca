// ============================================================
// GET    /api/v1/calendar-events/{id} — read   (scope: calendar:read)
// PATCH  /api/v1/calendar-events/{id} — update (scope: calendar:write)
// DELETE /api/v1/calendar-events/{id} — remove (scope: calendar:delete)
//
// Cancelling and deleting are different things and both are
// available: PATCH `status: "canceled"` keeps the event on the
// agenda struck through (what attendees expect), DELETE removes it
// from history entirely.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow, updateRow, deleteRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import {
  CALENDAR_SELECT,
  CALENDAR_FIELDS,
  serializeCalendarEvent,
  validateEventWindow,
  validateEventLinks,
} from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'calendar:read');
    const { id } = await params;

    const row = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'calendar_events',
      ctx.accountId,
      id,
      CALENDAR_SELECT
    );
    if (!row) return fail('not_found', 'Calendar event not found', 404);

    return ok(serializeCalendarEvent(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'calendar:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, CALENDAR_FIELDS);

    const existing = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'calendar_events',
      ctx.accountId,
      id,
      CALENDAR_SELECT
    );
    if (!existing) return fail('not_found', 'Calendar event not found', 404);

    // Moving one end of an event has to be checked against the
    // STORED other end, not against nothing. Sending only a later
    // `starts_at` is the ordinary way to push a meeting back, and
    // it's exactly the case that can cross `ends_at`.
    const badWindow = validateEventWindow(
      'starts_at' in updates ? updates.starts_at : existing.starts_at,
      'ends_at' in updates ? updates.ends_at : existing.ends_at
    );
    if (badWindow) return fail('bad_request', badWindow, 400);

    const badLink = await validateEventLinks(
      ctx.supabase,
      ctx.accountId,
      updates
    );
    if (badLink) return fail('bad_request', badLink, 400);

    const row = await updateRow<Record<string, unknown>>(
      ctx.supabase,
      'calendar_events',
      ctx.accountId,
      id,
      updates,
      CALENDAR_SELECT
    );
    if (!row) return fail('not_found', 'Calendar event not found', 404);

    return ok(serializeCalendarEvent(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'calendar:delete');
    const { id } = await params;

    const removed = await deleteRow(
      ctx.supabase,
      'calendar_events',
      ctx.accountId,
      id
    );
    if (!removed) return fail('not_found', 'Calendar event not found', 404);

    return new Response(null, { status: 204 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
