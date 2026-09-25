// ============================================================
// GET    /api/v1/companies/{id} — read   (scope: companies:read)
// PATCH  /api/v1/companies/{id} — update (scope: companies:write)
// DELETE /api/v1/companies/{id} — remove (scope: companies:delete)
//
// All three are account-scoped: a company belonging to another
// account returns 404, never 403 — we don't reveal that the id
// exists somewhere else.
//
// DELETE is a hard delete. `note_targets`, `task_targets` and
// `calendar_events.company_id` all point here; the first two cascade
// and the third nulls out, so an event survives losing its company
// rather than vanishing from the agenda.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow, updateRow, deleteRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import {
  COMPANY_SELECT,
  COMPANY_FIELDS,
  serializeCompany,
} from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'companies:read');
    const { id } = await params;

    const row = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'companies',
      ctx.accountId,
      id,
      COMPANY_SELECT
    );
    if (!row) return fail('not_found', 'Company not found', 404);

    return ok(serializeCompany(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'companies:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, COMPANY_FIELDS);

    const row = await updateRow<Record<string, unknown>>(
      ctx.supabase,
      'companies',
      ctx.accountId,
      id,
      updates,
      COMPANY_SELECT
    );
    if (!row) return fail('not_found', 'Company not found', 404);

    return ok(serializeCompany(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'companies:delete');
    const { id } = await params;

    const removed = await deleteRow(
      ctx.supabase,
      'companies',
      ctx.accountId,
      id
    );
    if (!removed) return fail('not_found', 'Company not found', 404);

    // 204: nothing useful to return, and an empty body is what
    // integrators' HTTP clients expect from a successful delete.
    return new Response(null, { status: 204 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
