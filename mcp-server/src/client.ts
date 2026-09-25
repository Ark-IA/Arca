// ============================================================
// wacrm public API client.
//
// A thin wrapper over the `/api/v1` REST surface. It attaches the
// bearer key, unwraps the `{ data }` / `{ error }` envelope, and
// turns API failures into a typed WacrmApiError the tools can render
// cleanly. Nothing here knows about MCP — it's just the CRM API.
// ============================================================

import type { Config } from './config.js';

/** A structured error from the wacrm API envelope (`{ error: { code, message } }`). */
export class WacrmApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WacrmApiError';
    this.status = status;
    this.code = code;
  }
}

export interface Paginated<T> {
  data: T[];
  next_cursor: string | null;
}

export class WacrmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: Pick<Config, 'baseUrl' | 'apiKey'>) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<{ data: T; meta?: { next_cursor: string | null } }> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new WacrmApiError(
        0,
        'network_error',
        `Could not reach wacrm at ${this.baseUrl}: ${(err as Error).message}`,
      );
    }

    // 429s carry a Retry-After we surface to the model.
    let payload: unknown = undefined;
    const text = await res.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Non-JSON body (e.g. an upstream proxy error page).
        if (!res.ok) {
          throw new WacrmApiError(res.status, 'internal', text.slice(0, 500));
        }
      }
    }

    if (!res.ok) {
      const envelope = payload as { error?: { code?: string; message?: string } } | undefined;
      const code = envelope?.error?.code ?? 'internal';
      let message = envelope?.error?.message ?? `Request failed with status ${res.status}`;
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) message += ` (retry after ${retryAfter}s)`;
      }
      throw new WacrmApiError(res.status, code, message);
    }

    // A successful DELETE answers 204 with no body, so there is no
    // envelope to unwrap. Reaching into `payload.data` here would
    // throw on undefined and surface as "Unexpected error" for what
    // is actually the success path.
    if (payload === undefined) {
      return { data: undefined as T };
    }

    const envelope = payload as { data: T; meta?: { next_cursor: string | null } };
    return { data: envelope.data, meta: envelope.meta };
  }

  private async list<T>(
    path: string,
    query: Record<string, string | number | undefined>,
  ): Promise<Paginated<T>> {
    const res = await this.request<T[]>('GET', path, { query });
    return { data: res.data, next_cursor: res.meta?.next_cursor ?? null };
  }

  // --- Identity -----------------------------------------------------

  me(): Promise<{ data: unknown }> {
    return this.request('GET', '/me');
  }

  // --- Messages -----------------------------------------------------

  sendMessage(body: unknown): Promise<{ data: unknown }> {
    return this.request('POST', '/messages', { body });
  }

  // --- Contacts -----------------------------------------------------

  listContacts(query: {
    limit?: number;
    cursor?: string;
    search?: string;
    tag?: string;
  }): Promise<Paginated<unknown>> {
    return this.list('/contacts', query);
  }

  getContact(id: string): Promise<{ data: unknown }> {
    return this.request('GET', `/contacts/${encodeURIComponent(id)}`);
  }

  createContact(body: unknown): Promise<{ data: unknown }> {
    return this.request('POST', '/contacts', { body });
  }

  updateContact(id: string, body: unknown): Promise<{ data: unknown }> {
    return this.request('PATCH', `/contacts/${encodeURIComponent(id)}`, { body });
  }

  // --- Conversations ------------------------------------------------

  listConversations(query: {
    limit?: number;
    cursor?: string;
    status?: string;
    contact_id?: string;
  }): Promise<Paginated<unknown>> {
    return this.list('/conversations', query);
  }

  getConversation(id: string): Promise<{ data: unknown }> {
    return this.request('GET', `/conversations/${encodeURIComponent(id)}`);
  }

  listConversationMessages(
    id: string,
    query: { limit?: number; cursor?: string },
  ): Promise<Paginated<unknown>> {
    return this.list(`/conversations/${encodeURIComponent(id)}/messages`, query);
  }

  // --- Broadcasts ---------------------------------------------------

  sendBroadcast(body: unknown): Promise<{ data: unknown }> {
    return this.request('POST', '/broadcasts', { body });
  }

  getBroadcast(id: string): Promise<{ data: unknown }> {
    return this.request('GET', `/broadcasts/${encodeURIComponent(id)}`);
  }

  // --- Custom objects -----------------------------------------------
  //
  // Generic over every object the account has defined: the object is
  // a path segment, not a compiled-in resource. One set of methods
  // covers objects that do not exist yet.

  listObjects(): Promise<Paginated<unknown>> {
    return this.list('/objects', {});
  }

  describeObject(object: string): Promise<{ data: unknown }> {
    return this.request('GET', `/objects/${encodeURIComponent(object)}`);
  }

  listRecords(
    object: string,
    query: { limit?: number; cursor?: string; where?: Record<string, string> },
  ): Promise<Paginated<unknown>> {
    const { where, ...rest } = query;
    // `where` is sent as repeated `where[field]=value` params, which
    // is what the endpoint parses.
    const flat: Record<string, string | number | undefined> = { ...rest };
    for (const [field, value] of Object.entries(where ?? {})) {
      flat[`where[${field}]`] = value;
    }
    return this.list(`/objects/${encodeURIComponent(object)}/records`, flat);
  }

  getRecord(object: string, id: string): Promise<{ data: unknown }> {
    return this.request(
      'GET',
      `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(id)}`,
    );
  }

  createRecord(object: string, fields: unknown): Promise<{ data: unknown }> {
    return this.request('POST', `/objects/${encodeURIComponent(object)}/records`, {
      body: { fields },
    });
  }

  updateRecord(object: string, id: string, fields: unknown): Promise<{ data: unknown }> {
    return this.request(
      'PATCH',
      `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(id)}`,
      { body: { fields } },
    );
  }

  deleteRecord(object: string, id: string): Promise<{ data: unknown }> {
    return this.request(
      'DELETE',
      `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(id)}`,
    );
  }

  // --- CRM resources ------------------------------------------------
  //
  // companies / tasks / notes / calendar-events / deals / pipelines.
  // The resource is a path segment here too, so the six share one
  // set of methods rather than thirty near-identical ones. The tool
  // layer constrains which names are allowed.

  crmList(
    resource: string,
    query: Record<string, string | number | undefined>,
  ): Promise<Paginated<unknown>> {
    return this.list(`/${resource}`, query);
  }

  crmGet(resource: string, id: string): Promise<{ data: unknown }> {
    return this.request('GET', `/${resource}/${encodeURIComponent(id)}`);
  }

  crmCreate(resource: string, body: unknown): Promise<{ data: unknown }> {
    return this.request('POST', `/${resource}`, { body });
  }

  crmUpdate(resource: string, id: string, body: unknown): Promise<{ data: unknown }> {
    return this.request('PATCH', `/${resource}/${encodeURIComponent(id)}`, { body });
  }

  crmDelete(resource: string, id: string): Promise<{ data: unknown }> {
    return this.request('DELETE', `/${resource}/${encodeURIComponent(id)}`);
  }
}
