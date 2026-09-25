// ============================================================
// Resource definitions for the public API (v1) CRM endpoints.
//
// Six resources — companies, tasks, notes, calendar events, deals
// and pipelines — each described once as data: the columns it
// selects, the fields a caller may write, and how a row is turned
// into the public shape.
//
// They live in ONE file on purpose. These six definitions have to
// stay parallel (same date handling, same null semantics, same
// naming), and the way to keep parallel things parallel is to make
// them visible side by side. Split across six files, they drift.
//
// The wire shape is written out field by field rather than spreading
// the row. A `select('*')` that leaked a new internal column into a
// public response would be a silent contract change; listing them
// means a new column stays invisible until someone adds it here.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type { FieldSpecs } from './fields';
import { assertSameAccount } from './crud';

// ============================================================
// Companies
// ============================================================

export const COMPANY_SELECT = '*';

export const COMPANY_FIELDS: FieldSpecs = {
  name: { type: 'string', required: true, maxLength: 200 },
  domain: { type: 'string', maxLength: 253 },
  phone: { type: 'string', maxLength: 40 },
  address: { type: 'string', maxLength: 300 },
  city: { type: 'string', maxLength: 120 },
  country: { type: 'string', maxLength: 120 },
  industry: { type: 'string', maxLength: 120 },
  employees: { type: 'number', integer: true, min: 0 },
  annual_revenue: { type: 'number', min: 0 },
  linkedin_url: { type: 'string', maxLength: 500 },
  notes: { type: 'string' },
  is_ideal_customer: { type: 'boolean' },
};

export interface ApiCompany {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  employees: number | null;
  annual_revenue: number | null;
  linkedin_url: string | null;
  notes: string | null;
  is_ideal_customer: boolean;
  created_at: string;
  updated_at: string;
}

export function serializeCompany(row: Record<string, unknown>): ApiCompany {
  return {
    id: row.id as string,
    name: row.name as string,
    domain: (row.domain as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    // numeric(14,2) comes back from PostgREST as a string; normalise
    // to a JSON number so clients don't parse per-column.
    employees: row.employees == null ? null : Number(row.employees),
    annual_revenue:
      row.annual_revenue == null ? null : Number(row.annual_revenue),
    linkedin_url: (row.linkedin_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    is_ideal_customer: Boolean(row.is_ideal_customer),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// ============================================================
// Tasks
// ============================================================

export const TASK_SELECT = '*';

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'done',
  'canceled',
] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;

export const TASK_FIELDS: FieldSpecs = {
  title: { type: 'string', required: true, maxLength: 300 },
  body: { type: 'string' },
  status: { type: 'enum', values: TASK_STATUSES },
  priority: { type: 'enum', values: TASK_PRIORITIES },
  due_at: { type: 'timestamp' },
  completed_at: { type: 'timestamp' },
  assignee_id: { type: 'uuid' },
};

export interface ApiTask {
  id: string;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeTask(row: Record<string, unknown>): ApiTask {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    status: row.status as string,
    priority: row.priority as string,
    due_at: (row.due_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    assignee_id: (row.assignee_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * `tasks.assignee_id` is an `auth.users.id`, and membership lives on
 * `profiles.account_id` — so this is a lookup BY user_id, not by the
 * profile's own primary key. Returns the message to 400 with, or
 * null when valid.
 *
 * Without it a key could assign work into another tenant: the FK
 * only proves the user exists somewhere in `auth.users`.
 */
export async function validateAssignee(
  db: SupabaseClient,
  accountId: string,
  assigneeId: unknown
): Promise<string | null> {
  if (assigneeId === null || assigneeId === undefined) return null;
  if (typeof assigneeId !== 'string') {
    return "'assignee_id' must be a UUID or null";
  }

  const { data } = await db
    .from('profiles')
    .select('user_id')
    .eq('user_id', assigneeId)
    .eq('account_id', accountId)
    .maybeSingle();

  return data ? null : "'assignee_id' is not a member of this account";
}

// ============================================================
// Notes
// ============================================================

export const NOTE_SELECT = '*, note_targets(contact_id, company_id, deal_id)';

export const NOTE_FIELDS: FieldSpecs = {
  title: { type: 'string', maxLength: 300 },
  body: { type: 'string' },
};

export interface ApiNote {
  id: string;
  title: string | null;
  body: string;
  /** What the note hangs off. Exactly one column is set per target. */
  targets: {
    contact_id: string | null;
    company_id: string | null;
    deal_id: string | null;
  }[];
  created_at: string;
  updated_at: string;
}

type RawTarget = {
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
};

export function serializeNote(row: Record<string, unknown>): ApiNote {
  const targets = (row.note_targets as RawTarget[] | undefined) ?? [];
  return {
    id: row.id as string,
    title: (row.title as string | null) ?? null,
    // `body` is NOT NULL DEFAULT '' in the schema, but a row written
    // before that default existed could still read back null.
    body: (row.body as string | null) ?? '',
    targets: targets.map((t) => ({
      contact_id: t.contact_id ?? null,
      company_id: t.company_id ?? null,
      deal_id: t.deal_id ?? null,
    })),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// ============================================================
// Calendar events
// ============================================================

export const CALENDAR_SELECT = '*';

export const CALENDAR_STATUSES = [
  'confirmed',
  'tentative',
  'canceled',
] as const;

export const CALENDAR_FIELDS: FieldSpecs = {
  title: { type: 'string', required: true, maxLength: 300 },
  description: { type: 'string' },
  location: { type: 'string', maxLength: 300 },
  meeting_url: { type: 'string', maxLength: 1000 },
  starts_at: { type: 'timestamp', required: true },
  ends_at: { type: 'timestamp', required: true },
  is_all_day: { type: 'boolean' },
  status: { type: 'enum', values: CALENDAR_STATUSES },
  contact_id: { type: 'uuid' },
  company_id: { type: 'uuid' },
  deal_id: { type: 'uuid' },
};

export interface ApiCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  status: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeCalendarEvent(
  row: Record<string, unknown>
): ApiCalendarEvent {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    meeting_url: (row.meeting_url as string | null) ?? null,
    starts_at: row.starts_at as string,
    ends_at: row.ends_at as string,
    is_all_day: Boolean(row.is_all_day),
    status: row.status as string,
    contact_id: (row.contact_id as string | null) ?? null,
    company_id: (row.company_id as string | null) ?? null,
    deal_id: (row.deal_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * The schema's `calendar_orden_de_horas` CHECK rejects an event that
 * ends before it starts. Catching it here gives a named 400 instead
 * of a constraint violation surfacing as a generic 500 — and on a
 * PATCH the comparison has to use the STORED value for whichever end
 * the caller did not send.
 */
export function validateEventWindow(
  startsAt: unknown,
  endsAt: unknown
): string | null {
  if (typeof startsAt !== 'string' || typeof endsAt !== 'string') return null;
  if (Date.parse(endsAt) < Date.parse(startsAt)) {
    return "'ends_at' cannot be earlier than 'starts_at'";
  }
  return null;
}

/** Validate the three optional CRM links an event can carry. */
export async function validateEventLinks(
  db: SupabaseClient,
  accountId: string,
  values: Record<string, unknown>
): Promise<string | null> {
  const links = [
    ['contact_id', 'contacts'],
    ['company_id', 'companies'],
    ['deal_id', 'deals'],
  ] as const;

  for (const [field, table] of links) {
    if (!(field in values)) continue;
    const problem = await assertSameAccount(
      db,
      table,
      accountId,
      values[field],
      field
    );
    if (problem) return problem;
  }
  return null;
}

// ============================================================
// Deals
// ============================================================

export const DEAL_SELECT = '*';

// Migration 002 replaced 001's free-text 'active' with this CHECK.
export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;

export const DEAL_FIELDS: FieldSpecs = {
  title: { type: 'string', required: true, maxLength: 300 },
  pipeline_id: { type: 'uuid', required: true },
  stage_id: { type: 'uuid', required: true },
  contact_id: { type: 'uuid', required: true },
  conversation_id: { type: 'uuid' },
  value: { type: 'number', min: 0 },
  currency: { type: 'string', maxLength: 10 },
  notes: { type: 'string' },
  expected_close_date: { type: 'date' },
  status: { type: 'enum', values: DEAL_STATUSES },
  assigned_to: { type: 'uuid' },
};

export interface ApiDeal {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string;
  conversation_id: string | null;
  value: number;
  currency: string | null;
  notes: string | null;
  expected_close_date: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeDeal(row: Record<string, unknown>): ApiDeal {
  return {
    id: row.id as string,
    title: row.title as string,
    pipeline_id: row.pipeline_id as string,
    stage_id: row.stage_id as string,
    contact_id: row.contact_id as string,
    conversation_id: (row.conversation_id as string | null) ?? null,
    value: row.value == null ? 0 : Number(row.value),
    currency: (row.currency as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    expected_close_date: (row.expected_close_date as string | null) ?? null,
    status: row.status as string,
    assigned_to: (row.assigned_to as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Every foreign key a deal carries, checked against THIS account.
 *
 * `stage_id` is the awkward one: `pipeline_stages` has no
 * `account_id` of its own (it inherits scope from its pipeline), so
 * it is verified through the parent — and at the same time we check
 * the stage really belongs to the pipeline named in the request. A
 * deal whose stage lives in a different pipeline renders in no
 * column of the board.
 *
 * `assigned_to` points at `profiles.id` — the profile's own key, not
 * the auth user id that `tasks.assignee_id` uses. Different columns
 * in different tables; mixing them up silently assigns nothing.
 */
export async function validateDealLinks(
  db: SupabaseClient,
  accountId: string,
  values: Record<string, unknown>,
  current?: { pipeline_id: string }
): Promise<string | null> {
  const links = [
    ['pipeline_id', 'pipelines'],
    ['contact_id', 'contacts'],
    ['conversation_id', 'conversations'],
    ['assigned_to', 'profiles'],
  ] as const;

  for (const [field, table] of links) {
    if (!(field in values)) continue;
    const problem = await assertSameAccount(
      db,
      table,
      accountId,
      values[field],
      field
    );
    if (problem) return problem;
  }

  if ('stage_id' in values) {
    const stageId = values.stage_id;
    if (typeof stageId !== 'string') return "'stage_id' must be a UUID";

    const pipelineId =
      typeof values.pipeline_id === 'string'
        ? values.pipeline_id
        : current?.pipeline_id;
    if (!pipelineId) return "'stage_id' requires a 'pipeline_id'";

    const { data } = await db
      .from('pipeline_stages')
      .select('id, pipelines!inner(account_id)')
      .eq('id', stageId)
      .eq('pipeline_id', pipelineId)
      .eq('pipelines.account_id', accountId)
      .maybeSingle();

    if (!data) return "'stage_id' does not belong to that pipeline";
  }

  return null;
}

// ============================================================
// Pipelines
// ============================================================

export const PIPELINE_SELECT =
  '*, pipeline_stages(id, name, position, color, created_at)';

export const PIPELINE_FIELDS: FieldSpecs = {
  name: { type: 'string', required: true, maxLength: 200 },
};

export const STAGE_FIELDS: FieldSpecs = {
  name: { type: 'string', required: true, maxLength: 200 },
  position: { type: 'number', integer: true, min: 0 },
  color: { type: 'string', maxLength: 30 },
};

export interface ApiPipeline {
  id: string;
  name: string;
  stages: {
    id: string;
    name: string;
    position: number;
    color: string;
  }[];
  created_at: string;
}

type RawStage = {
  id: string;
  name: string;
  position: number;
  color: string;
};

export function serializePipeline(row: Record<string, unknown>): ApiPipeline {
  const stages = (row.pipeline_stages as RawStage[] | undefined) ?? [];
  return {
    id: row.id as string,
    name: row.name as string,
    // PostgREST returns embedded rows in no guaranteed order, and a
    // board read out of order is a board drawn wrong.
    stages: [...stages]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        color: s.color,
      })),
    created_at: row.created_at as string,
  };
}
