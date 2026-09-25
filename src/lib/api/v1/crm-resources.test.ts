import { describe, expect, it } from 'vitest';

import {
  serializeCompany,
  serializeDeal,
  serializeNote,
  serializePipeline,
  serializeTask,
  validateEventWindow,
  COMPANY_FIELDS,
  DEAL_FIELDS,
  CALENDAR_FIELDS,
} from './crm-resources';
import { buildInsert } from './fields';

describe('serializeCompany', () => {
  it('turns PostgREST numeric strings into JSON numbers', () => {
    // numeric(14,2) comes back as a string; leaking that would make
    // every client parse per-column.
    const out = serializeCompany({
      id: 'c1',
      name: 'Acme',
      employees: 42,
      annual_revenue: '150000.00',
      is_ideal_customer: true,
      created_at: 'a',
      updated_at: 'b',
    });
    expect(out.annual_revenue).toBe(150000);
    expect(out.employees).toBe(42);
    expect(out.is_ideal_customer).toBe(true);
  });

  it('keeps nulls null instead of turning them into 0', () => {
    const out = serializeCompany({
      id: 'c1',
      name: 'Acme',
      employees: null,
      annual_revenue: null,
      created_at: 'a',
      updated_at: 'b',
    });
    expect(out.annual_revenue).toBeNull();
    expect(out.employees).toBeNull();
    expect(out.is_ideal_customer).toBe(false);
  });
});

describe('serializeTask', () => {
  it('passes the scalars through and defaults the optional ones to null', () => {
    const out = serializeTask({
      id: 't1',
      title: 'Call back',
      status: 'todo',
      priority: 'high',
      created_at: 'a',
      updated_at: 'b',
    });
    expect(out).toMatchObject({
      id: 't1',
      title: 'Call back',
      status: 'todo',
      priority: 'high',
      body: null,
      due_at: null,
      completed_at: null,
      assignee_id: null,
    });
  });
});

describe('serializeNote', () => {
  it('flattens the target join and survives a note with none', () => {
    expect(
      serializeNote({
        id: 'n1',
        body: 'hi',
        note_targets: [{ contact_id: 'c1', company_id: null, deal_id: null }],
        created_at: 'a',
        updated_at: 'b',
      }).targets
    ).toEqual([{ contact_id: 'c1', company_id: null, deal_id: null }]);

    expect(
      serializeNote({ id: 'n2', body: 'x', created_at: 'a', updated_at: 'b' }).targets
    ).toEqual([]);
  });

  it('reads a legacy null body as an empty string, never null', () => {
    // The column is NOT NULL today, but rows written before that
    // default existed can still read back null.
    expect(
      serializeNote({ id: 'n3', body: null, created_at: 'a', updated_at: 'b' }).body
    ).toBe('');
  });
});

describe('serializeDeal', () => {
  it('normalises the numeric value and defaults a null to 0', () => {
    expect(
      serializeDeal({
        id: 'd1',
        title: 'Big one',
        pipeline_id: 'p',
        stage_id: 's',
        contact_id: 'c',
        value: '2500.50',
        status: 'open',
        created_at: 'a',
        updated_at: 'b',
      }).value
    ).toBe(2500.5);

    expect(
      serializeDeal({
        id: 'd2',
        title: 'No value',
        pipeline_id: 'p',
        stage_id: 's',
        contact_id: 'c',
        value: null,
        status: 'open',
        created_at: 'a',
        updated_at: 'b',
      }).value
    ).toBe(0);
  });
});

describe('serializePipeline', () => {
  it('sorts the embedded stages by position', () => {
    // PostgREST returns embedded rows in no guaranteed order, and a
    // board read out of order is a board drawn wrong.
    const out = serializePipeline({
      id: 'p1',
      name: 'Ventas',
      pipeline_stages: [
        { id: 's3', name: 'Won', position: 2, color: '#0f0' },
        { id: 's1', name: 'New', position: 0, color: '#00f' },
        { id: 's2', name: 'Quoted', position: 1, color: '#ff0' },
      ],
      created_at: 'a',
    });
    expect(out.stages.map((s) => s.name)).toEqual(['New', 'Quoted', 'Won']);
  });

  it('handles a board with no stages yet', () => {
    expect(serializePipeline({ id: 'p2', name: 'Nuevo', created_at: 'a' }).stages).toEqual(
      []
    );
  });
});

describe('validateEventWindow', () => {
  it('rejects an event that ends before it starts', () => {
    expect(
      validateEventWindow('2026-09-22T15:00:00Z', '2026-09-22T14:00:00Z')
    ).toContain("'ends_at'");
  });

  it('allows a zero-length event', () => {
    // The schema's CHECK is `ends_at >= starts_at`, so equal is legal.
    expect(
      validateEventWindow('2026-09-22T15:00:00Z', '2026-09-22T15:00:00Z')
    ).toBeNull();
  });

  it('stays quiet when either end is absent', () => {
    // A patch that touches neither end has nothing to compare; the
    // route supplies the stored values when it does.
    expect(validateEventWindow(undefined, '2026-09-22T15:00:00Z')).toBeNull();
    expect(validateEventWindow('2026-09-22T15:00:00Z', null)).toBeNull();
  });
});

describe('field specs match the database constraints', () => {
  it('accepts only the deal statuses the CHECK allows', () => {
    expect(() =>
      buildInsert(
        {
          title: 'x',
          pipeline_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
          stage_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
          contact_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3303',
          // Migration 002 replaced 001's 'active' with open/won/lost.
          status: 'active',
        },
        DEAL_FIELDS
      )
    ).toThrow(/open, won, lost/);
  });

  it('requires both ends of a calendar event', () => {
    expect(() => buildInsert({ title: 'Meet' }, CALENDAR_FIELDS)).toThrow(
      /'starts_at' is required/
    );
  });

  it('requires a company name', () => {
    expect(() => buildInsert({ domain: 'acme.com' }, COMPANY_FIELDS)).toThrow(
      /'name' is required/
    );
  });
});
