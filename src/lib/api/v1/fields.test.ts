import { describe, expect, it } from 'vitest';

import { buildInsert, buildPatch, readJsonBody, type FieldSpecs } from './fields';
import { ApiError } from './respond';

const SPECS: FieldSpecs = {
  name: { type: 'string', required: true, maxLength: 10 },
  notes: { type: 'string' },
  status: { type: 'enum', values: ['todo', 'done'] },
  employees: { type: 'number', integer: true, min: 0 },
  revenue: { type: 'number', min: 0 },
  flagged: { type: 'boolean' },
  due_at: { type: 'timestamp' },
  close_on: { type: 'date' },
  owner_id: { type: 'uuid' },
};

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** Every validator failure must be an ApiError a route can map. */
function reason(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    return (err as ApiError).message;
  }
  throw new Error('expected a rejection, got none');
}

describe('buildInsert', () => {
  it('keeps only the fields the caller actually sent', () => {
    const row = buildInsert({ name: 'Acme', flagged: true }, SPECS);
    expect(row).toEqual({ name: 'Acme', flagged: true });
    // Absent optional fields must not appear at all, or they would
    // override the column's DEFAULT with an explicit null.
    expect('status' in row).toBe(false);
  });

  it('rejects a missing required field, naming it', () => {
    expect(reason(() => buildInsert({ notes: 'hi' }, SPECS))).toContain("'name'");
  });

  it('rejects an explicit null for a required field', () => {
    expect(reason(() => buildInsert({ name: null }, SPECS))).toContain("'name'");
  });

  it('ignores unknown keys rather than rejecting them', () => {
    // Forward compatibility: a client echoing back a whole record
    // shouldn't break when we add a read-only field.
    expect(buildInsert({ name: 'Acme', id: 'x', created_at: 'y' }, SPECS)).toEqual({
      name: 'Acme',
    });
  });
});

describe('buildPatch', () => {
  it('returns only present keys, so omitted fields stay untouched', () => {
    expect(buildPatch({ notes: 'updated' }, SPECS)).toEqual({ notes: 'updated' });
  });

  it('passes null through to clear an optional field', () => {
    expect(buildPatch({ notes: null }, SPECS)).toEqual({ notes: null });
  });

  it('refuses to null a required field', () => {
    expect(reason(() => buildPatch({ name: null }, SPECS))).toContain('cannot be null');
  });

  it('does not demand required fields that were not sent', () => {
    // The stored row already satisfies them; demanding them would
    // make a one-field patch impossible.
    expect(buildPatch({ notes: 'x' }, SPECS)).toEqual({ notes: 'x' });
  });
});

describe('coercion', () => {
  it('trims strings and treats empty as null', () => {
    expect(buildPatch({ notes: '  hi  ' }, SPECS)).toEqual({ notes: 'hi' });
    expect(buildPatch({ notes: '   ' }, SPECS)).toEqual({ notes: null });
  });

  it('enforces maxLength after trimming', () => {
    expect(reason(() => buildPatch({ name: 'x'.repeat(11) }, SPECS))).toContain(
      'at most 10'
    );
    expect(buildPatch({ name: `  ${'x'.repeat(10)}  ` }, SPECS)).toEqual({
      name: 'x'.repeat(10),
    });
  });

  it('lists the allowed values when an enum misses', () => {
    const message = reason(() => buildPatch({ status: 'nope' }, SPECS));
    expect(message).toContain('todo');
    expect(message).toContain('done');
  });

  it('rejects a numeric string rather than coercing it', () => {
    // Being liberal here means two clients store different types in
    // the same column, and numerics compare badly across the two.
    expect(reason(() => buildPatch({ revenue: '100' }, SPECS))).toContain(
      'must be a number'
    );
  });

  it('rejects NaN and Infinity', () => {
    expect(reason(() => buildPatch({ revenue: NaN }, SPECS))).toContain(
      'must be a number'
    );
    expect(reason(() => buildPatch({ revenue: Infinity }, SPECS))).toContain(
      'must be a number'
    );
  });

  it('enforces integer and min', () => {
    expect(reason(() => buildPatch({ employees: 1.5 }, SPECS))).toContain(
      'whole number'
    );
    expect(reason(() => buildPatch({ employees: -1 }, SPECS))).toContain(
      'at least 0'
    );
    expect(buildPatch({ employees: 0 }, SPECS)).toEqual({ employees: 0 });
  });

  it('normalises timestamps to UTC ISO', () => {
    // Two clients sending the same instant in different offsets must
    // store byte-identical values.
    expect(buildPatch({ due_at: '2026-09-22T10:00:00-05:00' }, SPECS)).toEqual({
      due_at: '2026-09-22T15:00:00.000Z',
    });
  });

  it('rejects an unparseable timestamp', () => {
    expect(reason(() => buildPatch({ due_at: 'tomorrow' }, SPECS))).toContain(
      'ISO-8601'
    );
  });

  it('requires dates to be YYYY-MM-DD, not a full timestamp', () => {
    expect(buildPatch({ close_on: '2026-09-22' }, SPECS)).toEqual({
      close_on: '2026-09-22',
    });
    expect(
      reason(() => buildPatch({ close_on: '2026-09-22T00:00:00Z' }, SPECS))
    ).toContain('YYYY-MM-DD');
  });

  it('validates uuids', () => {
    expect(buildPatch({ owner_id: UUID }, SPECS)).toEqual({ owner_id: UUID });
    expect(reason(() => buildPatch({ owner_id: 'not-a-uuid' }, SPECS))).toContain(
      'must be a UUID'
    );
  });

  it('rejects a non-boolean for a boolean field', () => {
    expect(reason(() => buildPatch({ flagged: 'true' }, SPECS))).toContain(
      'true or false'
    );
  });
});

describe('readJsonBody', () => {
  const asRequest = (body: string) =>
    new Request('https://example.com/x', { method: 'POST', body });

  it('returns a parsed object', async () => {
    await expect(readJsonBody(asRequest('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it('rejects arrays, scalars and malformed JSON with one wording', async () => {
    for (const body of ['[]', '"hi"', '42', 'null', 'not json']) {
      await expect(readJsonBody(asRequest(body))).rejects.toMatchObject({
        status: 400,
      });
    }
  });
});
