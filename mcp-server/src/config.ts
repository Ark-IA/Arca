// ============================================================
// Configuration — read once at startup from the environment.
//
// The server needs the URL of an ARCA instance and an API key.
// Two opt-in flags decide whether write / broadcast tools are
// registered at all: by default the server is READ-ONLY, so an
// MCP client can never see a tool that mutates data or sends a
// message unless the operator turns it on deliberately. The API
// key's own scopes are still enforced server-side on top of this —
// this is a second, client-side guard, not a replacement.
// ============================================================

export interface Config {
  baseUrl: string;
  apiKey: string;
  enableWrites: boolean;
  enableBroadcasts: boolean;
  enableDeletes: boolean;
}

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Read a setting under its ARCA name, falling back to the WACRM one.
 *
 * The server was renamed from `wacrm-mcp` when this fork took on its
 * own identity. Renaming the variables outright would have silently
 * broken every client config already pointing at it — and an MCP
 * server that fails at startup shows up as "the tool disappeared",
 * with nothing explaining why. Both spellings work; `ARCA_*` wins.
 *
 * (The API KEY format is a different matter and is NOT renamed: keys
 * carry a literal `wacrm_live_` prefix that is stored in the database
 * and checked on every request, so changing it would invalidate every
 * key already issued.)
 */
function ajuste(nombre: string): string | undefined {
  return (
    process.env[`ARCA_${nombre}`]?.trim() ||
    process.env[`WACRM_${nombre}`]?.trim()
  );
}

export function loadConfig(): Config {
  const baseUrlRaw = ajuste('BASE_URL');
  const apiKey = ajuste('API_KEY');

  const missing: string[] = [];
  if (!baseUrlRaw) missing.push('ARCA_BASE_URL');
  if (!apiKey) missing.push('ARCA_API_KEY');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set ARCA_BASE_URL to your instance URL (e.g. https://crm.example.com) ` +
        `and ARCA_API_KEY to a key from Settings → API keys. ` +
        `(The older WACRM_* names are still accepted.)`,
    );
  }

  // Normalise: strip a trailing slash so path joins are predictable.
  const baseUrl = baseUrlRaw!.replace(/\/+$/, '');
  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error(
      `ARCA_BASE_URL must start with http:// or https:// (got "${baseUrl}").`,
    );
  }

  const enableWrites = truthy(ajuste('ENABLE_WRITES'));
  const enableBroadcasts = truthy(ajuste('ENABLE_BROADCASTS'));
  const enableDeletes = truthy(ajuste('ENABLE_DELETES'));

  if (enableBroadcasts && !enableWrites) {
    throw new Error(
      'ARCA_ENABLE_BROADCASTS requires ARCA_ENABLE_WRITES to also be set.',
    );
  }

  // Deleting is a strictly larger capability than writing, and a
  // config that grants the destructive half without the ordinary
  // half is far more likely to be a mistake than an intention.
  if (enableDeletes && !enableWrites) {
    throw new Error(
      'ARCA_ENABLE_DELETES requires ARCA_ENABLE_WRITES to also be set.',
    );
  }

  return {
    baseUrl,
    apiKey: apiKey!,
    enableWrites,
    enableBroadcasts,
    enableDeletes,
  };
}
