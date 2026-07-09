/**
 * Sanitizes diagnostic payloads before they are shown to the user or sent
 * to the backend. Redacts common PII patterns.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// UUID v1-5
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
// Bearer / token=... / access_token=...
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const TOKEN_KV_RE = /\b((?:access[_-]?token|refresh[_-]?token|api[_-]?key|token)\s*[=:]\s*)['"]?[A-Za-z0-9._~+/=-]{8,}['"]?/gi;
// JWT-shaped strings
const JWT_RE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
// Any run of ≥5 digits (covers IBAN digits, card numbers, phone, long IDs)
const DIGIT_RUN_RE = /\d{5,}/g;

export function sanitizeString(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(EMAIL_RE, '[email]');
  out = out.replace(JWT_RE, '[token]');
  out = out.replace(BEARER_RE, 'Bearer [token]');
  out = out.replace(TOKEN_KV_RE, (_m, prefix) => `${prefix}[token]`);
  out = out.replace(UUID_RE, '[id]');
  out = out.replace(DIGIT_RUN_RE, '[num]');
  return out;
}

/**
 * Sanitize a route/path: replace UUID segments with [id]. Also runs
 * digit-run redaction so numeric ids are not leaked.
 */
export function sanitizeRoute(route: string): string {
  if (!route) return route;
  return route
    .replace(UUID_RE, '[id]')
    .replace(DIGIT_RUN_RE, '[num]');
}

export interface RawConsoleEntry {
  level: string;
  message: string;
  t: number;
}

export function sanitizeConsoleEntries(entries: RawConsoleEntry[]): RawConsoleEntry[] {
  return entries.map((e) => ({
    level: e.level,
    t: e.t,
    message: sanitizeString(e.message),
  }));
}

export interface RawDiagnostics {
  route: string;
  app_version: string;
  language: string;
  viewport: string;
  platform: string;
  user_agent: string;
  console_tail: RawConsoleEntry[];
}

export function sanitizeDiagnostics(diag: RawDiagnostics): RawDiagnostics {
  return {
    ...diag,
    route: sanitizeRoute(diag.route),
    user_agent: diag.user_agent, // user_agent kept as-is per spec
    console_tail: sanitizeConsoleEntries(diag.console_tail),
  };
}
