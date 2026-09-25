// ============================================================
// GET    /api/v1/tasks/{id} — read   (scope: tasks:read)
// PATCH  /api/v1/tasks/{id} — update (scope: tasks:write)
// DELETE /api/v1/tasks/{id} — remove (scope: tasks:delete)
//
// Account-scoped throughout: another account's task is a 404.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { getRow, updateRow, deleteRow } from '@/lib/api/v1/crud';
import { buildPatch, readJsonBody } from '@/lib/api/v1/fields';
import {
  TASK_SELECT,
  TASK_FIELDS,
  serializeTask,
  validateAssignee,
} from '@/lib/api/v1/crm-resources';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'tasks:read');
    const { id } = await params;

    const row = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'tasks',
      ctx.accountId,
      id,
      TASK_SELECT
    );
    if (!row) return fail('not_found', 'Task not found', 404);

    return ok(serializeTask(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'tasks:write');
    const { id } = await params;
    const body = await readJsonBody(request);
    const updates = buildPatch(body, TASK_FIELDS);

    if ('assignee_id' in updates) {
      const problem = await validateAssignee(
        ctx.supabase,
        ctx.accountId,
        updates.assignee_id
      );
      if (problem) return fail('bad_request', problem, 400);
    }

    // Closing a task should stamp when it closed. Doing it here
    // rather than in a trigger keeps the column honest for rows the
    // dashboard writes too — it sets the same pair — while still
    // letting a caller backdate it by sending `completed_at`
    // explicitly.
    if (updates.status === 'done' && !('completed_at' in updates)) {
      updates.completed_at = new Date().toISOString();
    }
    if (
      'status' in updates &&
      updates.status !== 'done' &&
      !('completed_at' in updates)
    ) {
      updates.completed_at = null;
    }

    const row = await updateRow<Record<string, unknown>>(
      ctx.supabase,
      'tasks',
      ctx.accountId,
      id,
      updates,
      TASK_SELECT
    );
    if (!row) return fail('not_found', 'Task not found', 404);

    return ok(serializeTask(row));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireApiKey(request, 'tasks:delete');
    const { id } = await params;

    const removed = await deleteRow(ctx.supabase, 'tasks', ctx.accountId, id);
    if (!removed) return fail('not_found', 'Task not found', 404);

    return new Response(null, { status: 204 });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
