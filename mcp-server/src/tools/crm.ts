// ============================================================
// CRM record tools — companies, tasks, notes, calendar events,
// deals and pipelines.
//
// These six are ordinary tables, not metadata-driven, so their
// fields COULD be spelled out one tool at a time. They are not,
// deliberately: six resources times four actions is twenty-four
// tools, and a tool list that long measurably degrades a model's
// ability to pick the right one. Five tools with a `resource`
// enum keeps the list short, and the field reference below lives
// in the tool description where the model actually reads it.
//
// The enum is the safety property that matters: `resource` becomes
// a URL path segment, so it must be a closed set rather than
// caller text. The API key's scopes are still enforced server-side
// on top (`companies:read`, `tasks:write`, …).
// ============================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WacrmClient } from '../client.js';
import { handle, jsonResult } from './shared.js';

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

/** The closed set of resources these tools may address. */
const RESOURCES = [
  'companies',
  'tasks',
  'notes',
  'calendar-events',
  'deals',
  'pipelines',
] as const;

const RESOURCE_ARG = z
  .enum(RESOURCES)
  .describe('Which CRM resource to act on.');

/**
 * The writable fields of each resource, as the model needs to see
 * them. Kept in one string so every tool description carries the
 * same reference and they cannot drift apart.
 */
const FIELD_REFERENCE = `
Fields by resource:
- companies: name (required), domain, phone, address, city, country, industry,
  employees (int), annual_revenue (number), linkedin_url, notes,
  is_ideal_customer (bool)
- tasks: title (required), body, status (todo|in_progress|done|canceled),
  priority (low|normal|high), due_at (ISO), completed_at (ISO),
  assignee_id (a user id in this account)
- notes: title, body, plus ONE of contact_id / company_id / deal_id on create
  to attach it to that record
- calendar-events: title (required), starts_at (ISO, required),
  ends_at (ISO, required), description, location, meeting_url,
  is_all_day (bool), status (confirmed|tentative|canceled),
  contact_id, company_id, deal_id
- deals: title (required), pipeline_id (required), stage_id (required),
  contact_id (required), value (number), currency, notes,
  expected_close_date (YYYY-MM-DD), status (open|won|lost), assigned_to
- pipelines: name (required), stages (array of { name, position, color })
`.trim();

export function registerCrmReadTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'crm_list',
    {
      title: 'List CRM records',
      description:
        'List companies, tasks, notes, calendar events, deals or pipelines, newest first. ' +
        'Filters accepted per resource: companies — search, ideal=true; ' +
        'tasks — status, priority, assignee (a user id, or "none" for unassigned), ' +
        'due_before/due_after (ISO), search; ' +
        'notes — contact_id / company_id / deal_id, search; ' +
        'calendar-events — from/to (ISO, bounding the start time), status, contact_id, company_id, deal_id; ' +
        'deals — pipeline_id, stage_id, status, contact_id, assigned_to, search; ' +
        'pipelines — none (stages come embedded). ' +
        'Paginated: pass the returned next_cursor for the next page. ' +
        'Note that calendar events page by creation date, so bound them with from/to and sort by starts_at yourself.',
      inputSchema: {
        resource: RESOURCE_ARG,
        filters: z
          .record(z.string())
          .optional()
          .describe('Query filters for this resource, e.g. { "status": "todo" }.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor from a previous response.'),
      },
      annotations: { ...READ_ONLY, title: 'List CRM records' },
    },
    handle(async ({ resource, filters, limit, cursor }) =>
      jsonResult(await client.crmList(resource, { ...filters, limit, cursor })),
    ),
  );

  server.registerTool(
    'crm_get',
    {
      title: 'Get a CRM record',
      description:
        'Read a single company, task, note, calendar event, deal or pipeline by its id.',
      inputSchema: {
        resource: RESOURCE_ARG,
        id: z.string().describe('Record id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get a CRM record' },
    },
    handle(async ({ resource, id }) => jsonResult(await client.crmGet(resource, id))),
  );
}

export function registerCrmWriteTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'crm_create',
    {
      title: 'Create a CRM record',
      description:
        `Create a company, task, note, calendar event, deal or pipeline.\n\n${FIELD_REFERENCE}\n\n` +
        'Ids referenced in the payload (contact_id, pipeline_id, …) must belong to this account; ' +
        'a deal\'s stage_id must belong to its pipeline_id.',
      inputSchema: {
        resource: RESOURCE_ARG,
        data: z.record(z.unknown()).describe('The record to create. See the field reference above.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        title: 'Create a CRM record',
      },
    },
    handle(async ({ resource, data }) => jsonResult(await client.crmCreate(resource, data))),
  );

  server.registerTool(
    'crm_update',
    {
      title: 'Update a CRM record',
      description:
        `Update a company, task, note, calendar event, deal or pipeline. Only the fields you send ` +
        `are changed; send null to clear one. Setting a task's status to "done" stamps completed_at ` +
        `automatically.\n\n${FIELD_REFERENCE}\n\n` +
        'Note: a note\'s attachment cannot be changed, and moving a deal between pipelines requires ' +
        'sending stage_id as well.',
      inputSchema: {
        resource: RESOURCE_ARG,
        id: z.string().describe('Record id.'),
        data: z.record(z.unknown()).describe('Only the fields to change.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        title: 'Update a CRM record',
      },
    },
    handle(async ({ resource, id, data }) =>
      jsonResult(await client.crmUpdate(resource, id, data)),
    ),
  );
}

export function registerCrmDeleteTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'crm_delete',
    {
      title: 'Delete a CRM record',
      description:
        'Permanently delete a company, task, note, calendar event or deal. This cannot be undone — ' +
        'read the record first and confirm it is the right one. Pipelines cannot be deleted through ' +
        'the API at all, because removing one would cascade into every deal on its board.',
      inputSchema: {
        // Pipelines are absent on purpose: the API has no DELETE for
        // them, and offering a tool that always fails would just
        // burn a turn discovering that.
        resource: z
          .enum(['companies', 'tasks', 'notes', 'calendar-events', 'deals'])
          .describe('Which CRM resource to delete from.'),
        id: z.string().describe('Record id.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
        title: 'Delete a CRM record',
      },
    },
    handle(async ({ resource, id }) => {
      await client.crmDelete(resource, id);
      return jsonResult({ deleted: true, resource, id });
    }),
  );
}
