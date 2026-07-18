/**
 * Shared JSON salvage + parse helpers for AI-produced content.
 *
 * Handles three failure modes seen with Gemini free-text + tool-calling output:
 *   (a) reasoning leak / prose before the JSON payload
 *   (b) ```json fences around the payload
 *   (c) truncation when max_tokens is hit mid-array/string
 *
 * Works for both object-rooted (`{...}`) and array-rooted (`[...]`) payloads.
 */

export function stripFences(s: string): string {
  return s.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
}

/**
 * Try to salvage a truncated JSON payload starting with `{` or `[`.
 * Closes open strings, arrays, objects, drops a dangling `,` or partial key.
 * Returns a string that can be JSON.parse'd, or null if hopeless.
 */
export function attemptJsonSalvage(input: string): string | null {
  if (!input) return null;
  const root = input[0];
  if (root !== '{' && root !== '[') return null;

  let s = input;

  // Cut back to last safe terminator so we drop any half-written key/value.
  const lastComma = s.lastIndexOf(',');
  const lastCloseBrace = s.lastIndexOf('}');
  const lastCloseBracket = s.lastIndexOf(']');
  const safeCut = Math.max(lastComma, lastCloseBrace, lastCloseBracket);
  if (safeCut > 0) s = s.slice(0, safeCut);

  let inString = false;
  let escaped = false;
  const stack: Array<'{' | '['> = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c as '{' | '[');
    else if (c === '}' || c === ']') stack.pop();
  }

  let closer = '';
  if (inString) closer += '"';
  if (s.endsWith(',')) s = s.slice(0, -1);
  while (stack.length) {
    const open = stack.pop();
    closer += open === '{' ? '}' : ']';
  }
  return s + closer;
}

export type ParseMode = 'clean' | 'fenced' | 'braces' | 'salvage-truncated';

/**
 * Robust JSON parser that tries clean → fences → bracket-slice → salvage.
 * `root` selects the expected outermost bracket. Returns { value, mode } or null.
 */
export function robustParseJson<T = unknown>(
  content: string,
  root: 'object' | 'array' = 'object',
): { value: T; mode: ParseMode } | null {
  const open = root === 'object' ? '{' : '[';
  const close = root === 'object' ? '}' : ']';

  const tryParse = (s: string): T => JSON.parse(s) as T;

  // (a) clean
  try {
    return { value: tryParse(content.trim()), mode: 'clean' };
  } catch { /* next */ }

  // (b) strip fences
  const stripped = stripFences(content);
  try {
    return { value: tryParse(stripped), mode: 'fenced' };
  } catch { /* next */ }

  // (c) first ... last bracket slice
  const first = stripped.indexOf(open);
  const last = stripped.lastIndexOf(close);
  if (first >= 0 && last > first) {
    const slice = stripped.slice(first, last + 1);
    try {
      return { value: tryParse(slice), mode: 'braces' };
    } catch { /* next */ }
  }

  // (d) salvage truncated payload
  if (first >= 0) {
    const salvage = attemptJsonSalvage(stripped.slice(first));
    if (salvage) {
      try {
        return { value: tryParse(salvage), mode: 'salvage-truncated' };
      } catch { /* fall through */ }
    }
  }

  return null;
}

/**
 * Fire-and-forget diagnostic log to app_diagnostics_logs via service role.
 * Never throws.
 */
export async function logParseFailure(
  event: string,
  userId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/app_diagnostics_logs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify([{
        event,
        user_id: userId,
        session_id: `edge-${event}-${Date.now()}`,
        details,
      }]),
    });
  } catch { /* ignore */ }
}
