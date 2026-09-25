// ============================================================
// GET /api/v1/objects — list the account's custom objects
//                       (scope: objects:read)
//
// The discovery endpoint: a client calls this first to learn what
// objects exist, then addresses them by `name` at
// `/api/v1/objects/{name}/records`. An MCP client uses it the same
// way, which is what lets one tool cover every object.
//
// Inactive objects are included with `is_active: false` rather than
// hidden — an integration that stops seeing an object needs to be
// able to tell "archived" from "deleted".
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { okList, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { serializeObjectSummary } from '@/lib/api/v1/custom-objects';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'objects:read');

    // Objects are schema, not data: an account has tens of them, not
    // thousands. Returning the whole set unpaged keeps discovery one
    // round-trip, and `meta.next_cursor` stays null so the shape
    // still matches every other v1 list.
    const { data, error } = await ctx.supabase
      .from('custom_objects')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('label_singular', { ascending: true });

    if (error) {
      console.error('[api/v1/objects] list error:', error);
      return fail('internal', 'Failed to list objects', 500);
    }

    return okList((data ?? []).map(serializeObjectSummary), null);
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
