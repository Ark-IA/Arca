// ============================================================
// Custom-object tools — generic over every object the account has
// defined.
//
// These seven tools replace what would otherwise be a tool per
// object per action, growing every time someone adds an object in
// the UI. Instead the model discovers what exists at runtime:
//
//   list_objects      → what objects are there?
//   describe_object   → what fields does this one take?
//   list_records      → read them, with filters
//   create/update/delete_record
//
// That discovery step is why the descriptions below insist on
// calling `describe_object` first: field names are the account's
// own schema, not something this server can know in advance, and
// the API rejects an unknown field rather than silently dropping
// it. One describe turns a guess into a correct write.
// ============================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WacrmClient } from '../client.js';
import { handle, jsonResult } from './shared.js';

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
} as const;

const OBJECT_ARG = z
  .string()
  .describe(
    "The object's name, as returned by list_objects (e.g. 'project'). Its plural or its UUID also work.",
  );

export function registerObjectReadTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'list_objects',
    {
      title: 'List custom objects',
      description:
        'List the custom objects defined in this CRM — the account-specific record types beyond the built-in contacts and conversations. Call this to discover what can be read or written, then call describe_object for the one you need.',
      inputSchema: {},
      annotations: { ...READ_ONLY, title: 'List custom objects' },
    },
    handle(async () => jsonResult(await client.listObjects())),
  );

  server.registerTool(
    'describe_object',
    {
      title: 'Describe a custom object',
      description:
        "Read one custom object's schema: every field with its name, label, type and whether it is required. ALWAYS call this before creating or updating a record — record payloads are keyed by field name, and an unknown name is rejected rather than ignored.",
      inputSchema: { object: OBJECT_ARG },
      annotations: { ...READ_ONLY, title: 'Describe a custom object' },
    },
    handle(async ({ object }) => jsonResult(await client.describeObject(object))),
  );

  server.registerTool(
    'list_records',
    {
      title: 'List records of a custom object',
      description:
        "List records of one custom object, newest first. Filter on exact field values with `where`, e.g. { \"status\": \"open\" } — keys must be field names from describe_object. Paginated: pass the returned next_cursor for the next page.",
      inputSchema: {
        object: OBJECT_ARG,
        where: z
          .record(z.string())
          .optional()
          .describe('Exact-match filters keyed by field name, e.g. { "status": "open" }.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Page size, 1–100 (default 50).'),
        cursor: z.string().optional().describe('Opaque pagination cursor from a previous response.'),
      },
      annotations: { ...READ_ONLY, title: 'List records' },
    },
    handle(async ({ object, ...query }) => jsonResult(await client.listRecords(object, query))),
  );

  server.registerTool(
    'get_record',
    {
      title: 'Get a record',
      description: 'Read a single record of a custom object by its id.',
      inputSchema: {
        object: OBJECT_ARG,
        id: z.string().describe('Record id.'),
      },
      annotations: { ...READ_ONLY, title: 'Get a record' },
    },
    handle(async ({ object, id }) => jsonResult(await client.getRecord(object, id))),
  );
}

export function registerObjectWriteTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'create_record',
    {
      title: 'Create a record',
      description:
        'Create a record of a custom object. `fields` is keyed by FIELD NAME — call describe_object first to learn the names and which are required. Unknown field names are rejected, so a typo fails loudly instead of losing data.',
      inputSchema: {
        object: OBJECT_ARG,
        fields: z
          .record(z.unknown())
          .describe('Field values keyed by field name, e.g. { "name": "Acme", "budget": 5000 }.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        title: 'Create a record',
      },
    },
    handle(async ({ object, fields }) => jsonResult(await client.createRecord(object, fields))),
  );

  server.registerTool(
    'update_record',
    {
      title: 'Update a record',
      description:
        'Update a record of a custom object. Only the fields you send are changed — the rest are left alone, so you do not need to send the whole record. Send null to clear a field.',
      inputSchema: {
        object: OBJECT_ARG,
        id: z.string().describe('Record id.'),
        fields: z
          .record(z.unknown())
          .describe('Only the field values to change, keyed by field name.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        title: 'Update a record',
      },
    },
    handle(async ({ object, id, fields }) =>
      jsonResult(await client.updateRecord(object, id, fields)),
    ),
  );
}

export function registerObjectDeleteTools(server: McpServer, client: WacrmClient): void {
  server.registerTool(
    'delete_record',
    {
      title: 'Delete a record',
      description:
        'Permanently delete a record of a custom object. This cannot be undone. Read the record first and confirm it is the right one.',
      inputSchema: {
        object: OBJECT_ARG,
        id: z.string().describe('Record id.'),
      },
      annotations: { ...DESTRUCTIVE, title: 'Delete a record' },
    },
    handle(async ({ object, id }) => {
      await client.deleteRecord(object, id);
      return jsonResult({ deleted: true, object, id });
    }),
  );
}
