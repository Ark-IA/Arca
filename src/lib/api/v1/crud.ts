// ============================================================
// Account-scoped CRUD primitives for public API (v1) resources.
//
// The six CRM resources (companies, tasks, notes, calendar events,
// deals, pipelines) are plain account-scoped tables, and their
// routes would otherwise be the same twenty lines six times over:
// filter by `account_id`, keyset-page, over-fetch by one, map the
// PostgREST error to a 500, serialize.
//
// These helpers hold exactly that shared part. What stays in each
// route file is what actually differs — the scope it requires, the
// filters it accepts, and how it serializes a row.
//
// THE INVARIANT: every function here takes `accountId` and applies
// it as an `.eq('account_id', …)` on both the read and the write.
// The public API authenticates with a service-role client (see
// `api-context.ts`), so RLS is NOT the thing keeping one account out
// of another's rows — this filter is. It is not optional and it is
// not a performance detail.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './respond';
import { buildPage, keysetFilter, type Cursor } from './pagination';

/** A row shape every table here satisfies — what keyset paging needs. */
export interface BaseRow {
  id: string;
  created_at: string;
}

/** Equality filters to apply, e.g. `{ status: 'todo' }`. Nulls skipped. */
export type EqFilters = Record<string, string | number | boolean | null>;

function internal(table: string, op: string, error: unknown): ApiError {
  // Log the real PostgREST error for operators; return a generic
  // message so column names and constraint text never reach the wire.
  console.error(`[api/v1/${table}] ${op} error:`, error);
  return new ApiError('internal', `Failed to ${op} ${table}`, 500);
}

/**
 * Strip anything that could break PostgREST's `.or()` grammar, which
 * is comma/paren-delimited and gets the term interpolated raw. Keeps
 * the characters a name, domain or phone legitimately contains. Same
 * guard the hand-written contact search uses.
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} +@.\-_]/gu, '').trim();
}

export interface ListOptions {
  table: string;
  accountId: string;
  select: string;
  limit: number;
  cursor: Cursor | null;
  /** Optional equality filters; entries with a null value are ignored. */
  eq?: EqFilters;
  /** Case-insensitive substring match across one or more columns. */
  search?: { term: string; columns: readonly string[] };
  /** Inclusive lower bounds, e.g. `{ starts_at: '2026-09-01T00:00:00Z' }`. */
  gte?: Record<string, string | null>;
  /** Inclusive upper bounds. */
  lte?: Record<string, string | null>;
  /**
   * Columns that must be NULL — the "unassigned queue" shape. This
   * cannot go through `eq`, whose null entries mean "no filter", and
   * it must be applied IN the query: filtering nulls out of an
   * already-paged result would return short pages and a cursor that
   * skips rows.
   */
  isNull?: readonly string[];
}

/**
 * List one page of an account's rows, newest first, using the same
 * keyset cursor contract as every other v1 list endpoint.
 */
export async function listRows<T extends BaseRow>(
  db: SupabaseClient,
  {
    table,
    accountId,
    select,
    limit,
    cursor,
    eq,
    search,
    gte,
    lte,
    isNull,
  }: ListOptions
): Promise<{ items: T[]; nextCursor: string | null }> {
  let query = db.from(table).select(select).eq('account_id', accountId);

  for (const [column, value] of Object.entries(eq ?? {})) {
    if (value === null || value === undefined) continue;
    query = query.eq(column, value);
  }

  for (const [column, value] of Object.entries(gte ?? {})) {
    if (value === null || value === undefined) continue;
    query = query.gte(column, value);
  }

  for (const [column, value] of Object.entries(lte ?? {})) {
    if (value === null || value === undefined) continue;
    query = query.lte(column, value);
  }

  for (const column of isNull ?? []) {
    query = query.is(column, null);
  }

  // Two separate `.or()` calls (this one and the keyset below) are
  // ANDed by PostgREST, which is what we want: match the search AND
  // sit past the cursor. Folding them into one would OR them and
  // quietly restart pagination on every page.
  const term = search ? sanitizeSearch(search.term) : '';
  if (term) {
    query = query.or(
      search!.columns.map((c) => `${c}.ilike.*${term}*`).join(',')
    );
  }

  query = query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const kf = keysetFilter(cursor);
  if (kf) query = query.or(kf);

  const { data, error } = await query;
  if (error) throw internal(table, 'list', error);

  // Cast via unknown: `select` is a runtime string, so supabase-js
  // cannot infer a row type from it.
  return buildPage((data ?? []) as unknown as T[], limit);
}

/**
 * Read one row by id, scoped to the account. Returns null when it
 * does not exist OR belongs to another account — the caller turns
 * both into the same 404, so a probe can't learn that an id exists
 * somewhere else.
 */
export async function getRow<T>(
  db: SupabaseClient,
  table: string,
  accountId: string,
  id: string,
  select: string
): Promise<T | null> {
  const { data, error } = await db
    .from(table)
    .select(select)
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw internal(table, 'read', error);
  return (data as unknown as T) ?? null;
}

/**
 * Insert a row into the account. `account_id` is set here rather
 * than by the caller so a resource module can never forget it.
 */
export async function insertRow<T>(
  db: SupabaseClient,
  table: string,
  accountId: string,
  values: Record<string, unknown>,
  select: string
): Promise<T> {
  const { data, error } = await db
    .from(table)
    .insert({ ...values, account_id: accountId })
    .select(select)
    .single();

  if (error) throw internal(table, 'create', error);
  return data as unknown as T;
}

/**
 * Update a row in place. Returns null when the id is absent from
 * this account — same 404-not-403 reasoning as `getRow`. `values`
 * may be empty (a patch that touched nothing); the row is returned
 * unchanged rather than issuing a pointless UPDATE.
 *
 * `touch: false` skips the `updated_at` stamp, for the tables from
 * migration 001 that never got one (`pipelines`, `pipeline_stages`).
 * Writing it anyway would fail the whole UPDATE on a column that
 * does not exist.
 */
export async function updateRow<T>(
  db: SupabaseClient,
  table: string,
  accountId: string,
  id: string,
  values: Record<string, unknown>,
  select: string,
  options: { touch?: boolean } = {}
): Promise<T | null> {
  if (Object.keys(values).length === 0) {
    return getRow<T>(db, table, accountId, id, select);
  }

  const patch =
    options.touch === false
      ? values
      : { ...values, updated_at: new Date().toISOString() };

  const { data, error } = await db
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('account_id', accountId)
    .select(select)
    .maybeSingle();

  if (error) throw internal(table, 'update', error);
  return (data as unknown as T) ?? null;
}

/**
 * Delete a row. Returns false when nothing matched, which the route
 * turns into a 404 — so a repeated DELETE is honestly reported as
 * "already gone" rather than falsely succeeding.
 */
export async function deleteRow(
  db: SupabaseClient,
  table: string,
  accountId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await db
    .from(table)
    .delete()
    .eq('id', id)
    .eq('account_id', accountId)
    .select('id')
    .maybeSingle();

  if (error) throw internal(table, 'delete', error);
  return data != null;
}

/**
 * Confirm a caller-supplied foreign key points at a row in the SAME
 * account before storing it. Without this, a key could attach its
 * deal to another tenant's contact: the FK constraint only checks
 * that the id exists *somewhere*, not that it is theirs.
 *
 * Returns the error message to 400 with, or null when valid.
 */
export async function assertSameAccount(
  db: SupabaseClient,
  table: string,
  accountId: string,
  id: unknown,
  field: string
): Promise<string | null> {
  if (id === null || id === undefined) return null;
  if (typeof id !== 'string') return `'${field}' must be a UUID or null`;

  const { data, error } = await db
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw internal(table, 'read', error);
  return data ? null : `'${field}' does not reference a ${table} in this account`;
}
