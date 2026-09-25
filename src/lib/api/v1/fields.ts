// ============================================================
// Declarative field validation for public API (v1) writes.
//
// Every resource added in the CRM expansion (companies, tasks,
// notes, calendar events, deals, pipelines) accepts a small set of
// scalar fields, and each one needs the same three behaviours the
// hand-written contact routes already implement:
//
//   * POST  — required fields must be present; unknown keys ignored.
//   * PATCH — a field is touched only when its key is PRESENT, so
//             omitting it leaves the column alone while `null`
//             clears it.
//   * Bad input is a 400 that NAMES the field, never a silently
//     dropped value.
//
// Writing that by hand six times would be six chances to get the
// present-vs-null distinction subtly wrong. So each resource
// declares its fields once, as data, and `buildInsert`/`buildPatch`
// apply the rules.
//
// Validators throw `ApiError` via `badRequest`, which every route's
// existing `catch (err) { return toApiErrorResponse(err) }` already
// maps to the envelope — no new error plumbing.
// ============================================================

import { badRequest } from './respond';

export type FieldSpec =
  /** Free text. `maxLength` guards against unbounded column writes. */
  | { type: 'string'; required?: boolean; maxLength?: number }
  /** One of a fixed set — mirrors a CHECK constraint in the schema. */
  | { type: 'enum'; values: readonly string[]; required?: boolean }
  /** Numeric. `integer` and `min` mirror the column's CHECKs. */
  | { type: 'number'; required?: boolean; integer?: boolean; min?: number }
  | { type: 'boolean'; required?: boolean }
  /** ISO-8601 instant, stored into a `timestamptz`. */
  | { type: 'timestamp'; required?: boolean }
  /** `YYYY-MM-DD`, stored into a `date`. */
  | { type: 'date'; required?: boolean }
  /** A UUID — a foreign key the caller supplies. */
  | { type: 'uuid'; required?: boolean };

/** A resource's writable surface: column name → how to validate it. */
export type FieldSpecs = Record<string, FieldSpec>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate one value against one spec. `null` is accepted for every
 * type (it clears the column) EXCEPT where the caller marked the
 * field required on insert — that check lives in `buildInsert`,
 * because "required" is about presence, not about the value's shape.
 */
function coerce(name: string, spec: FieldSpec, value: unknown): unknown {
  if (value === null) return null;

  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string') {
        throw badRequest(`'${name}' must be a string or null`);
      }
      const trimmed = value.trim();
      if (spec.maxLength !== undefined && trimmed.length > spec.maxLength) {
        throw badRequest(
          `'${name}' must be at most ${spec.maxLength} characters`
        );
      }
      // An empty string and NULL mean the same thing to every column
      // here ("not set"), and storing both would make callers write
      // `field === '' || field === null` forever. Normalise to null.
      return trimmed === '' ? null : trimmed;
    }

    case 'enum': {
      if (typeof value !== 'string' || !spec.values.includes(value)) {
        throw badRequest(
          `'${name}' must be one of: ${spec.values.join(', ')}`
        );
      }
      return value;
    }

    case 'number': {
      // Reject the string "5". Being liberal here would mean a typo
      // in a client silently writing a different type than the next
      // client, and numeric columns compare badly across the two.
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw badRequest(`'${name}' must be a number or null`);
      }
      if (spec.integer && !Number.isInteger(value)) {
        throw badRequest(`'${name}' must be a whole number`);
      }
      if (spec.min !== undefined && value < spec.min) {
        throw badRequest(`'${name}' must be at least ${spec.min}`);
      }
      return value;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        throw badRequest(`'${name}' must be true or false`);
      }
      return value;
    }

    case 'timestamp': {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw badRequest(
          `'${name}' must be an ISO-8601 timestamp (e.g. 2026-09-22T15:00:00Z) or null`
        );
      }
      // Normalise to UTC ISO so two clients sending the same instant
      // in different offsets store byte-identical values.
      return new Date(value).toISOString();
    }

    case 'date': {
      if (typeof value !== 'string' || !DATE_RE.test(value)) {
        throw badRequest(`'${name}' must be a date as YYYY-MM-DD or null`);
      }
      return value;
    }

    case 'uuid': {
      if (typeof value !== 'string' || !UUID_RE.test(value)) {
        throw badRequest(`'${name}' must be a UUID or null`);
      }
      return value;
    }
  }
}

/**
 * Build the column map for an INSERT. Required fields must be
 * present and non-null; optional fields are included only when the
 * caller sent them, so the column's DEFAULT still applies otherwise.
 * Unknown body keys are ignored rather than rejected — forward
 * compatibility for clients that echo back a whole record.
 */
export function buildInsert(
  body: Record<string, unknown>,
  specs: FieldSpecs
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(specs)) {
    const present = name in body;

    if (spec.required && (!present || body[name] === null)) {
      throw badRequest(`'${name}' is required`);
    }
    if (!present) continue;

    row[name] = coerce(name, spec, body[name]);
  }

  return row;
}

/**
 * Build the column map for a PATCH. Only keys PRESENT in the body
 * are returned, so omitted fields are untouched and `null` clears
 * them. Required-ness does not apply to a patch (the row already
 * exists) but a required field may not be nulled out — that would
 * leave a row the schema's NOT NULL forbids, and failing here gives
 * a named 400 instead of a raw Postgres error.
 */
export function buildPatch(
  body: Record<string, unknown>,
  specs: FieldSpecs
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(specs)) {
    if (!(name in body)) continue;

    if (spec.required && body[name] === null) {
      throw badRequest(`'${name}' cannot be null`);
    }

    updates[name] = coerce(name, spec, body[name]);
  }

  return updates;
}

/**
 * Parse a request body as a JSON object, or 400. Shared so every
 * write route rejects `null`, arrays and scalars with one wording.
 */
export async function readJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}
