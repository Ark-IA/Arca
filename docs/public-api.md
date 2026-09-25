# Public API (`/api/v1`)

The public API lets you drive your wacrm instance from your own
scripts and automations — send messages, manage contacts, launch
broadcasts — without going through the dashboard UI.

> **Status:** stable. Authentication, scopes, rate limiting, the
> messages / contacts / conversations / broadcasts endpoints, and
> outbound event [webhooks](#webhooks) all ship now.

## Authentication

Every request authenticates with an **API key**, sent as a bearer
token:

```
Authorization: Bearer wacrm_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are **account-scoped**: a key acts on exactly one account, the
one it was created in. There is no cross-account access.

### Creating a key

In the dashboard: **Settings → API keys → New API key**. Only
**admins and owners** can create keys.

1. Give the key a name (after the integration that will use it).
2. Grant the **scopes** it needs — nothing more (see below).
3. Copy the key. **The full key is shown exactly once.** wacrm
   stores only a SHA-256 hash, so it can never be shown again. If you
   lose it, revoke it and create a new one.

### Revoking a key

**Settings → API keys → Revoke.** Revocation is effective on the
key's next request. Revoked keys stay in the list as an audit trail.

## Scopes

A key can do only what its scopes allow — independent of who created
it. Grant the minimum.

| Scope                | Allows                                   |
| -------------------- | ---------------------------------------- |
| `messages:send`      | Send WhatsApp messages                   |
| `messages:read`      | Read messages and delivery status        |
| `contacts:read`      | List and read contacts                   |
| `contacts:write`     | Create and update contacts               |
| `conversations:read` | List and read conversations              |
| `broadcasts:send`    | Launch broadcast campaigns               |
| `webhooks:manage`    | Register and manage outbound webhooks    |
| `objects:read`       | List custom objects, fields and records  |
| `objects:write`      | Create and update custom-object records  |
| `objects:delete`     | Delete custom-object records             |
| `companies:read` / `:write` / `:delete`  | Companies              |
| `tasks:read` / `:write` / `:delete`      | Tasks                  |
| `notes:read` / `:write` / `:delete`      | Notes                  |
| `calendar:read` / `:write` / `:delete`   | Calendar events        |
| `deals:read` / `:write` / `:delete`      | Deals                  |
| `pipelines:read` / `:write`              | Pipelines and stages   |

`:read` covers list and read, `:write` covers create and update, and
`:delete` covers delete. Delete is a separate scope on purpose: most
integrations need to create and update but never to destroy, so the
ordinary key can be issued without the ability to lose data.

A key with **no scopes** still authenticates and can call
`GET /api/v1/me` — useful for verifying a key works.

## Response envelope

Every response uses one of two shapes:

```jsonc
// success
{ "data": { /* ... */ } }

// failure
{ "error": { "code": "forbidden", "message": "This API key is missing the 'messages:send' scope" } }
```

Branch on `error.code` (stable); `error.message` is for humans and
may be reworded.

| Status | `code`         | Meaning                                          |
| ------ | -------------- | ------------------------------------------------ |
| 401    | `unauthorized` | Missing / malformed / unknown / revoked / expired key |
| 403    | `forbidden`    | Valid key, but missing the required scope        |
| 429    | `rate_limited` | Per-key rate limit exceeded                      |
| 400    | `bad_request`  | Malformed input                                  |
| 404    | `not_found`    | No such resource                                 |
| 500    | `internal`     | Server error                                     |

## Rate limits

Requests are limited **per key**: **120 requests per minute**. On a
`429`, these headers tell you when to retry:

- `Retry-After` — seconds until the window resets
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

> The limiter is in-memory and **per process**. A single-instance
> deploy (the common case for a self-hosted fork) is fine as-is. If
> you scale to multiple instances, swap the limiter for a shared
> store (Redis/Upstash) — see the note at the top of
> `src/lib/rate-limit.ts`. The limit is otherwise unenforced across
> instances.

## Endpoints

### `GET /api/v1/me`

Returns the account a key is bound to and the scopes it carries.
Requires only a valid key (no scope). Use it to verify a key works
and to discover its scopes.

```bash
curl https://your-crm.example.com/api/v1/me \
  -H "Authorization: Bearer wacrm_live_xxx"
```

```json
{
  "data": {
    "account": { "id": "…", "name": "Acme Inc" },
    "key": { "id": "…", "scopes": ["messages:send"] }
  }
}
```

### `POST /api/v1/messages`

Send a WhatsApp message to a phone number. Scope: `messages:send`. You
pass an **E.164 number**, not an internal id — the endpoint
finds-or-creates the contact + conversation, then sends.

```bash
curl -X POST https://your-crm.example.com/api/v1/messages \
  -H "Authorization: Bearer wacrm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "to": "+14155550123", "type": "text", "text": "Hi 👋" }'
```

`type` is `text` (default), `template`, or a media kind (`image` /
`video` / `document` / `audio`). Media needs `media_url` (and optional
`filename`); `text` doubles as the caption. `template` needs a
`template` object:

```jsonc
{
  "to": "+14155550123",
  "type": "template",
  "template": {
    "name": "order_update",
    "language": "en_US",
    "params": ["A123"]        // positional body vars, or a structured object
  },
  "reply_to_message_id": "<uuid>"   // optional; must be in the same conversation
}
```

Response (201):

```json
{
  "data": {
    "message_id": "…",
    "whatsapp_message_id": "wamid.…",
    "conversation_id": "…",
    "contact_id": "…",
    "contact_created": true
  }
}
```

Domain error codes beyond the table above: `whatsapp_not_configured`
(400), `meta_error` (502 — the request reached Meta and it rejected the
send), `template_malformed` (500).

### `GET /api/v1/contacts`

List contacts, newest first. Scope: `contacts:read`. Paginated (see
[Pagination](#pagination)). Optional filters: `?search=` (matches name
or phone) and `?tag=<tagId>`.

```json
{
  "data": [
    {
      "id": "…", "phone": "+14155550123", "name": "Jane Doe",
      "email": null, "company": "Acme", "avatar_url": null,
      "tags": [{ "id": "…", "name": "vip", "color": "#3b82f6" }],
      "created_at": "…", "updated_at": "…"
    }
  ],
  "meta": { "next_cursor": "…" }
}
```

### `POST /api/v1/contacts`

Create a contact. Scope: `contacts:write`. `phone` (E.164) is required;
`name`, `email`, `company`, and `tags` (an array of tag names, created
if missing) are optional. **Find-or-create by phone:** an existing
match returns `200` with the existing contact; a new contact returns
`201`. The response body is the serialized contact (same shape as the
list rows above).

### `GET` / `PATCH /api/v1/contacts/{id}`

Read or update one contact. Scopes: `contacts:read` / `contacts:write`.
`PATCH` updates only the fields you send (`name`, `email`, `company`);
pass `tags` (an array of tag names) to replace the contact's tags. A
contact in another account returns `404`.

### `GET /api/v1/conversations`

List conversations, newest first. Scope: `conversations:read`.
Paginated. Optional filters: `?status=` (`open` / `pending` / `closed`)
and `?contact_id=`. Each conversation embeds its contact + tags.

### `GET /api/v1/conversations/{id}`

Read one conversation. Scope: `conversations:read`. `404` if it belongs
to another account.

### `GET /api/v1/conversations/{id}/messages`

List a conversation's messages, newest first. Scope: `messages:read`.
Paginated. Each message includes its `direction` (`inbound` /
`outbound`), `status` (delivery state), `whatsapp_message_id`, and
`content_*`. The conversation is verified to belong to your account
first (`404` otherwise).

### `POST /api/v1/broadcasts`

Launch a template broadcast to a list of recipients. Scope:
`broadcasts:send`. The broadcast + its recipient rows are persisted
immediately and the sends fan out in the background, so the call
returns fast — poll `GET /api/v1/broadcasts/{id}` for progress.

```bash
curl -X POST https://your-crm.example.com/api/v1/broadcasts \
  -H "Authorization: Bearer wacrm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
        "name": "July promo",
        "template_name": "promo_july",
        "template_language": "en_US",
        "recipients": [
          { "to": "+14155550123", "params": ["Jane"] },
          { "to": "+14155550124" }
        ]
      }'
```

Recipients are capped at **1000 per request** — split larger sends.
Invalid phone numbers are dropped and counted as `rejected`. Response
(202):

```json
{
  "data": {
    "broadcast_id": "…",
    "status": "sending",
    "total_recipients": 2,
    "accepted": 2,
    "rejected": 0
  }
}
```

### `GET /api/v1/broadcasts/{id}`

Broadcast status + counts. Scope: `broadcasts:send`. `status` moves
`sending` → `sent`; `delivered_count` / `read_count` keep climbing as
Meta delivery webhooks arrive. `404` for another account's broadcast.

## Pagination

Every list endpoint pages the same way. Request a page size with
`?limit=` (default 50, max 100) and read the next page with the opaque
`meta.next_cursor` from the previous response:

```
GET /api/v1/contacts?limit=50
→ { "data": [ … ], "meta": { "next_cursor": "eyJ…" } }

GET /api/v1/contacts?limit=50&cursor=eyJ…
→ { "data": [ … ], "meta": { "next_cursor": null } }   // last page
```

Cursors are keyset-based (stable under concurrent inserts). Pass the
cursor back verbatim — don't parse it. `next_cursor: null` means the
last page.

## Webhooks

Rather than polling, register an endpoint and wacrm will POST to it when
things happen in your account. **Migration required:** apply
`supabase/migrations/028_webhook_endpoints.sql`.

### Events

| Event                    | Fires when                                        |
| ------------------------ | ------------------------------------------------- |
| `message.received`       | An inbound message arrives from a contact         |
| `message.status_updated` | A message you sent changed delivery status        |
| `conversation.created`   | A new conversation is opened for a contact        |

### Managing endpoints

All under scope `webhooks:manage`.

- `POST /api/v1/webhooks` — register `{ "url": "https://…", "events": ["message.received"] }`. `url` must be `https://`. **The response includes `secret` exactly once** — store it to verify signatures; wacrm keeps only an encrypted copy.
- `GET /api/v1/webhooks` — list your endpoints (never returns the secret).
- `GET /api/v1/webhooks/{id}` — read one.
- `PATCH /api/v1/webhooks/{id}` — update `url`, `events`, or `is_active` (re-enabling clears the failure counter).
- `DELETE /api/v1/webhooks/{id}` — remove one.

```bash
curl -X POST https://your-crm.example.com/api/v1/webhooks \
  -H "Authorization: Bearer wacrm_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/hooks/wacrm", "events": ["message.received"] }'
# → 201 { "data": { "id": "…", "url": "…", "events": [...], "secret": "whsec_…" } }
```

### Delivery payload

Every delivery is a POST with this envelope; `id` is a unique per-
delivery uuid you can dedupe on, and `data` varies by `event`:

```json
{
  "id": "8f3c…",
  "event": "message.received",
  "occurred_at": "2026-07-01T12:00:00.000Z",
  "account_id": "…",
  "data": { /* per-event, see below */ }
}
```

`data` by event:

```jsonc
// message.received
{ "conversation_id": "…", "contact_id": "…", "whatsapp_message_id": "wamid.…", "content_type": "text", "text": "Hi 👋" }
// conversation.created
{ "conversation_id": "…", "contact_id": "…" }
// message.status_updated
{ "whatsapp_message_id": "wamid.…", "conversation_id": "…", "status": "delivered" }
```

Headers: `X-Wacrm-Event`, `X-Wacrm-Webhook-Id`, and `X-Wacrm-Signature`.

### Verifying the signature

`X-Wacrm-Signature: t=<unix_seconds>,v1=<hex>` where `v1 =
HMAC-SHA256(secret, "${t}.${rawBody}")`. Recompute it over the **raw
request body** and compare in constant time; reject if `t` is more than
a few minutes old (replay protection).

```js
const [, t, v1] = header.match(/t=(\d+),v1=([0-9a-f]+)/);
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.${rawBody}`).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
```

### Delivery semantics

Delivery is **best-effort**: a single attempt per event with a short
timeout, and **redirects are not followed**. `message.status_updated`
covers messages wacrm stores (inbox + API sends), not broadcast-only
sends, and — because providers re-send and re-order status callbacks —
the same status may arrive more than once or out of order; **dedupe on
`id` and don't assume ordering**. Each consecutive failure increments
`failure_count`; after enough consecutive failures the endpoint is
auto-disabled (`is_active: false`) — re-enable it with `PATCH` (which
resets the counter). Durable retry-with-backoff (a delivery queue) is a
future enhancement; today, treat missed deliveries as possible and
reconcile with the read endpoints when it matters.

**Target restrictions (SSRF).** The `url` must be `https://` and must
resolve to a public address — requests to `localhost`, private/RFC1918
ranges, link-local (incl. cloud metadata `169.254.169.254`), and similar
internal targets are refused at delivery time.

## Custom objects

Custom objects are the account's own record types, defined in the
dashboard under **Objects**. They do **not** get a hand-written
endpoint each: one generic set of routes serves every object, present
and future, by reading the object's definition at request time.

An object is addressed in the URL by its `name` — its singular name,
e.g. `project`. Its plural and its UUID also resolve, because guessing
wrong about pluralisation is the most likely mistake a caller makes.

### `GET /api/v1/objects`

Discovery. Lists every object with its labels, icon and active flag.
Scope: `objects:read`. Objects are schema, not data, so the whole set
comes back unpaged and `meta.next_cursor` is always `null`.

```bash
curl https://your-crm.example.com/api/v1/objects   -H "Authorization: Bearer wacrm_live_xxx"
```

### `GET /api/v1/objects/{object}`

The object's schema: every active field with its `name`, `label`,
`type`, `required` and `options`. Scope: `objects:read`. Read this
before writing a record — payloads are keyed by field **name**.

### `GET /api/v1/objects/{object}/records`

List records, newest first, keyset-paginated like every other
collection. Scope: `objects:read`.

Filter on exact field values with `where[<field>]=<value>`:

```bash
curl "https://your-crm.example.com/api/v1/objects/project/records?where[status]=open&limit=20"   -H "Authorization: Bearer wacrm_live_xxx"
```

A `where` key that is not a field on the object is a `400`, not a
silently ignored filter — otherwise a typo would look like "no matching
records" and quietly return the wrong answer.

### `POST /api/v1/objects/{object}/records`

Create a record. Scope: `objects:write`. Field values are keyed by
field name:

```bash
curl -X POST https://your-crm.example.com/api/v1/objects/project/records   -H "Authorization: Bearer wacrm_live_xxx"   -H "Content-Type: application/json"   -d '{ "fields": { "name": "Rebuild the website", "budget": 12000 } }'
```

A bare `{ "name": … }` without the `fields` wrapper is accepted too.
**Unknown field names are rejected**, with the error naming the field
and listing what the object actually has.

### `GET` / `PATCH` / `DELETE /api/v1/objects/{object}/records/{id}`

Read, update and delete one record. Scopes: `objects:read`,
`objects:write`, `objects:delete`.

`PATCH` **merges**: the keys you send are written, the rest are left
alone. It never replaces the whole field map — a client that
round-trips a subset of fields would otherwise wipe the others.

Writes go through the same path the dashboard uses, so each one
appends to the object's audit log (`field_audit_logs`).

## CRM records

Six ordinary resources, all account-scoped, all following the same
shape: `GET` (list) and `POST` on the collection, `GET` / `PATCH` /
`DELETE` on `/{id}`. A `DELETE` answers `204` with no body. Another
account's id is a `404`, never a `403`.

| Resource | Path | Scopes |
| -------- | ---- | ------ |
| Companies | `/api/v1/companies` | `companies:*` |
| Tasks | `/api/v1/tasks` | `tasks:*` |
| Notes | `/api/v1/notes` | `notes:*` |
| Calendar events | `/api/v1/calendar-events` | `calendar:*` |
| Deals | `/api/v1/deals` | `deals:*` |
| Pipelines | `/api/v1/pipelines` | `pipelines:*` |

### Filters

| Resource | Query parameters |
| -------- | ---------------- |
| Companies | `search` (name/domain), `ideal=true` |
| Tasks | `status`, `priority`, `assignee` (user id, or `none`), `due_before`, `due_after`, `search` |
| Notes | `contact_id`, `company_id`, `deal_id`, `search` |
| Calendar events | `from`, `to` (ISO, bounding `starts_at`), `status`, `contact_id`, `company_id`, `deal_id` |
| Deals | `pipeline_id`, `stage_id`, `status`, `contact_id`, `assigned_to`, `search` |
| Pipelines | — (stages come embedded) |

### Notes attach to exactly one record

Pass one of `contact_id`, `company_id` or `deal_id` when creating a
note and it is attached to that record; pass none for a free-standing
note. Sending two is a `400`. The attachment cannot be changed
afterwards — re-pointing a note at a different contact would rewrite
history the timeline has already rendered.

### Deals and the board

`stage_id` must belong to the deal's `pipeline_id`; a mismatch is a
`400`, because a deal on a foreign stage renders in no column of the
board. Moving a deal to another pipeline therefore requires sending
`stage_id` in the same request — the endpoint will not pick a stage
for you, since where a deal lands is a sales decision.

### Calendar events do not create Meet or Teams links

`meeting_url` is a plain link **you supply**. Nothing here talks to
Google Meet, Microsoft Teams, Google Calendar or Outlook: there is no
OAuth connection, no room is created, and nothing syncs. Creating a
real Meet room requires an authenticated Google account, which this
API does not hold.

Also note that events page by **creation** date, not start time, like
every other v1 collection — the keyset cursor contract is
`(created_at, id)` across the whole API. To draw an agenda, bound the
window with `from`/`to` and sort by `starts_at` client-side.

### Pipelines cannot be deleted

There is no `DELETE /api/v1/pipelines/{id}`. `deals.pipeline_id`
cascades, so dropping a board would silently destroy every deal on it
— an outcome that should require a human looking at a warning, not an
API key with a typo in a script. Stages have no delete either: a stage
still holding deals cannot be removed at the database level anyway, and
an endpoint that fails exactly when it matters is worse than none.

Stages are managed at `POST /api/v1/pipelines/{id}/stages` and
`PATCH /api/v1/pipelines/{id}/stages/{stageId}`, or created inline by
passing a `stages` array when creating the pipeline.

## Roadmap

The public API now covers messaging, contacts, conversations,
broadcasts, outbound webhooks, custom objects and the CRM records
(companies, tasks, notes, calendar events, deals, pipelines). Not yet
scheduled: templates, flows, telephony, the AI agent, a delivery queue
for webhooks, and calendar sync with Google/Microsoft.
