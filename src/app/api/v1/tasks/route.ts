// ============================================================
// GET  /api/v1/tasks — list tasks  (scope: tasks:read)
// POST /api/v1/tasks — create a task (scope: tasks:write)
//
// Filters: `?status=`, `?priority=`, `?assignee=` (an auth user id,
// or the literal `none` for the unassigned queue) and `?search=`
// over the title. `?due_before=` / `?due_after=` bound the due date,
// which is how a "what's overdue" integration reads the list.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams } from '@/lib/api/v1/pagination';
import { listRows, insertRow, type BaseRow } from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import {
  TASK_SELECT,
  TASK_FIELDS,
  serializeTask,
  validateAssignee,
} from '@/lib/api/v1/crm-resources';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'tasks:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);

    // `assignee=none` is the common-queue view: tasks nobody owns.
    // It needs an `is null`, which the equality map deliberately
    // cannot express (a null there means "no filter").
    const assignee = url.searchParams.get('assignee');
    const unassigned = assignee === 'none';

    const { items, nextCursor } = await listRows<BaseRow>(ctx.supabase, {
      table: 'tasks',
      accountId: ctx.accountId,
      select: TASK_SELECT,
      limit,
      cursor,
      eq: {
        status: url.searchParams.get('status'),
        priority: url.searchParams.get('priority'),
        assignee_id: unassigned ? null : assignee,
      },
      isNull: unassigned ? ['assignee_id'] : [],
      search: {
        term: url.searchParams.get('search') ?? '',
        columns: ['title'],
      },
      gte: { due_at: url.searchParams.get('due_after') },
      lte: { due_at: url.searchParams.get('due_before') },
    });

    return okList(
      items.map((r) => serializeTask(r as unknown as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'tasks:write');
    const body = await readJsonBody(request);
    const values = buildInsert(body, TASK_FIELDS);

    const problem = await validateAssignee(
      ctx.supabase,
      ctx.accountId,
      values.assignee_id
    );
    if (problem) return fail('bad_request', problem, 400);

    const row = await insertRow<Record<string, unknown>>(
      ctx.supabase,
      'tasks',
      ctx.accountId,
      values,
      TASK_SELECT
    );

    return ok(serializeTask(row), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
