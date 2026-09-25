// ============================================================
// GET    /api/v1/notes/{id} — read   (scope: notes:read)
// PATCH  /api/v1/notes/{id} — update (scope: notes:write)
// DELETE /api/v1/notes/{id} — remove (scope: notes:delete)
//
// PATCH edits the note's own text only. What a note is attached to
// is not editable: re-pointing a note at a different contact would
// rewrite history that the timeline already rendered. Detach by
// deleting the note and writing a new one.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow, updateRow, deleteRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import {
  NOTE_SELECT,
  NOTE_FIELDS,
  serializeNote,
} from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'notes:read');
    const { id } = await params;

    const row = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'notes',
      ctx.accountId,
      id,
      NOTE_SELECT
    );
    if (!row) return fail('not_found', 'Note not found', 404);

    return ok(serializeNote(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'notes:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, NOTE_FIELDS);

    // `body` is NOT NULL; the field spec normalises '' to null, so
    // clearing the text has to write the empty string the column
    // actually allows.
    if ('body' in updates && updates.body == null) updates.body = '';

    const row = await updateRow<Record<string, unknown>>(
      ctx.supabase,
      'notes',
      ctx.accountId,
      id,
      updates,
      NOTE_SELECT
    );
    if (!row) return fail('not_found', 'Note not found', 404);

    return ok(serializeNote(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'notes:delete');
    const { id } = await params;

    // `note_targets.note_id` cascades, so the join rows go with it.
    const removed = await deleteRow(ctx.supabase, 'notes', ctx.accountId, id);
    if (!removed) return fail('not_found', 'Note not found', 404);

    return new Response(null, { status: 204 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
