// ============================================================
// GET  /api/v1/notes — list notes  (scope: notes:read)
// POST /api/v1/notes — create a note (scope: notes:write)
//
// A note hangs off a contact, a company or a deal through the
// `note_targets` join. Pass exactly one of `contact_id`,
// `company_id` or `deal_id` on create to attach it; pass none for a
// free-standing note. Filter the list the same way.
//
// The schema's `note_targets_un_destino` CHECK enforces exactly one
// column per target row, so sending two is a 400 here rather than a
// constraint violation surfacing as a 500.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { parseListParams } from '@/lib/api/v1/pagination';
import {
  listRows,
  insertRow,
  getRow,
  assertSameAccount,
  type BaseRow,
} from '@/lib/api/v1/crud';
import { buildInsert, readJsonBody } from '@/lib/api/v1/fields';
import {
  NOTE_SELECT,
  NOTE_FIELDS,
  serializeNote,
} from '@/lib/api/v1/crm-resources';

/** The three columns a target row can carry, and where each points. */
const TARGETS = [
  ['contact_id', 'contacts'],
  ['company_id', 'companies'],
  ['deal_id', 'deals'],
] as const;

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'notes:read');
    const { limit, cursor } = parseListParams(request);
    const url = new URL(request.url);

    // Filtering by target needs an aliased INNER join used purely
    // for the WHERE — the note is kept only if it has a matching
    // target row. The main `note_targets(...)` embed still returns
    // the note's FULL target set for serialization. Same shape as
    // the contacts-by-tag filter.
    const filters: Record<string, string | null> = {};
    let selectClause = NOTE_SELECT;

    for (const [field] of TARGETS) {
      const value = url.searchParams.get(field);
      if (!value) continue;
      selectClause = `${NOTE_SELECT}, target_filter:note_targets!inner(${field})`;
      filters[`target_filter.${field}`] = value;
      break;
    }

    const { items, nextCursor } = await listRows<BaseRow>(ctx.supabase, {
      table: 'notes',
      accountId: ctx.accountId,
      select: selectClause,
      limit,
      cursor,
      eq: filters,
      search: {
        term: url.searchParams.get('search') ?? '',
        columns: ['title', 'body'],
      },
    });

    return okList(
      items.map((r) => serializeNote(r as unknown as Record<string, unknown>)),
      nextCursor
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'notes:write');
    const body = await readJsonBody(request);
    const values = buildInsert(body, NOTE_FIELDS);

    // `body` is NOT NULL in the schema and the field spec treats an
    // empty string as null, so put the column's own default back
    // rather than letting the insert fail on a note that is only a
    // title.
    if (values.body == null) values.body = '';

    const supplied = TARGETS.filter(([field]) => body[field] != null);
    if (supplied.length > 1) {
      return fail(
        'bad_request',
        'A note attaches to exactly one of contact_id, company_id or deal_id',
        400
      );
    }

    for (const [field, table] of supplied) {
      const problem = await assertSameAccount(
        ctx.supabase,
        table,
        ctx.accountId,
        body[field],
        field
      );
      if (problem) return fail('bad_request', problem, 400);
    }

    const row = await insertRow<{ id: string }>(
      ctx.supabase,
      'notes',
      ctx.accountId,
      values,
      'id'
    );

    if (supplied.length === 1) {
      const [field] = supplied[0];
      const { error } = await ctx.supabase
        .from('note_targets')
        .insert({ note_id: row.id, [field]: body[field] });

      // The note itself is already written. Report the failure
      // rather than returning a note the caller believes is
      // attached — a silently orphaned note is worse than an error.
      if (error) {
        console.error('[api/v1/notes] target insert error:', error);
        return fail('internal', 'Note created but could not be attached', 500);
      }
    }

    const created = await getRow<Record<string, unknown>>(
      ctx.supabase,
      'notes',
      ctx.accountId,
      row.id,
      NOTE_SELECT
    );

    return ok(serializeNote(created ?? {}), 201);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
