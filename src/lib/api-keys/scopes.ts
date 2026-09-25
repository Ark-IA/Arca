// ============================================================
// API key scopes — pure, unit-testable, no I/O.
//
// Authorization for the public API is *scopes-only*: a key's
// capabilities are defined entirely by the scopes granted to it at
// creation, independent of the role of the user who minted it. (We
// still gate *key creation* at admin+, so only trusted members can
// hand out capabilities — see the management routes.)
//
// A scope is `<resource>:<action>`. Endpoints declare the single
// scope they require; `requireApiKey(request, scope)` enforces it.
// Adding a capability = one entry here + the endpoint that checks
// it. No migration needed (the DB stores scopes as a free `text[]`).
//
// Actions follow one convention across every resource:
//
//   :read    GET   — list and read
//   :write   POST  + PATCH — create and update
//   :delete  DELETE — remove
//
// `:delete` is deliberately its own scope rather than folded into
// `:write`. Integrations overwhelmingly need to create and update;
// very few need to destroy. Splitting them means the common key can
// be issued without ever being able to lose data.
// ============================================================

export const API_SCOPES = [
  // --- WhatsApp messaging (the original wacrm surface) ----------
  'messages:send',
  'messages:read',
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'broadcasts:send',
  'webhooks:manage',

  // --- Custom objects (the Twenty-style metadata layer) ---------
  // One scope pair covers EVERY custom object, present and future:
  // the endpoints are generic over `custom_objects`, so granting
  // `objects:read` grants read on all of them. Per-object limits
  // are enforced separately by `object_permissions`.
  'objects:read',
  'objects:write',
  'objects:delete',

  // --- CRM records ---------------------------------------------
  'companies:read',
  'companies:write',
  'companies:delete',
  'tasks:read',
  'tasks:write',
  'tasks:delete',
  'notes:read',
  'notes:write',
  'notes:delete',
  'calendar:read',
  'calendar:write',
  'calendar:delete',
  'deals:read',
  'deals:write',
  'deals:delete',

  // Pipelines are structure, not records: deleting one cascades
  // into every deal it holds. The API therefore exposes read and
  // write but NO delete — dropping a pipeline stays a deliberate
  // act performed in the dashboard, by a human, with the warning
  // in front of them. See docs/public-api.md.
  'pipelines:read',
  'pipelines:write',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Human-readable descriptions, surfaced in the key-creation UI. */
export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  'messages:send': 'Send WhatsApp messages',
  'messages:read': 'Read messages and their delivery status',
  'contacts:read': 'List and read contacts',
  'contacts:write': 'Create and update contacts',
  'conversations:read': 'List and read conversations',
  'broadcasts:send': 'Launch broadcast campaigns',
  'webhooks:manage': 'Register and manage outbound event webhooks',

  'objects:read': 'List custom objects, their fields, and their records',
  'objects:write': 'Create and update custom object records',
  'objects:delete': 'Delete custom object records',

  'companies:read': 'List and read companies',
  'companies:write': 'Create and update companies',
  'companies:delete': 'Delete companies',

  'tasks:read': 'List and read tasks',
  'tasks:write': 'Create and update tasks',
  'tasks:delete': 'Delete tasks',

  'notes:read': 'List and read notes',
  'notes:write': 'Create and update notes',
  'notes:delete': 'Delete notes',

  'calendar:read': 'List and read calendar events',
  'calendar:write': 'Create and update calendar events',
  'calendar:delete': 'Delete calendar events',

  'deals:read': 'List and read deals',
  'deals:write': 'Create and update deals',
  'deals:delete': 'Delete deals',

  'pipelines:read': 'List pipelines and their stages',
  'pipelines:write': 'Create and update pipelines and their stages',
};

/** Type-narrow an unknown value into a valid `ApiScope`. */
export function isApiScope(value: unknown): value is ApiScope {
  return (
    typeof value === 'string' &&
    (API_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Validate and de-duplicate a caller-supplied scope list. Returns
 * the cleaned list, or `null` if any entry is not a known scope
 * (callers turn that into a 400). An empty input is valid — it
 * yields a key that authenticates but can't do anything beyond the
 * scope-free endpoints (e.g. `GET /api/v1/me`).
 */
export function normalizeScopes(input: unknown): ApiScope[] | null {
  if (!Array.isArray(input)) return null;
  const out: ApiScope[] = [];
  for (const entry of input) {
    if (!isApiScope(entry)) return null;
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

/**
 * True iff `granted` contains `required`. The single source of
 * truth for "is this key allowed to do X?" — both `requireApiKey`
 * and any future inline check should call this rather than poking
 * at the array directly.
 */
export function hasScope(
  granted: readonly string[],
  required: ApiScope
): boolean {
  return granted.includes(required);
}
