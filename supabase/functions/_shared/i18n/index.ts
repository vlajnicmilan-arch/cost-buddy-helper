// Shared i18n catalog loader for edge functions.
//
// - `resolveLang` normalises any string to one of the supported languages
//   ('hr' | 'en' | 'de'), falling back to 'hr'.
// - `translate` looks up a key in the language's catalog and interpolates
//   {{placeholder}} variables. If the key is missing in the requested language,
//   it falls back to HR; if still missing, it returns the key itself so
//   callers can log a diagnostic.
//
// The three catalogs (hr/en/de) MUST agree on their key set and placeholder
// names — enforced by src/i18n/__tests__/serverCatalogSync.test.ts.
import hr from "./hr.ts";
import en from "./en.ts";
import de from "./de.ts";

export const SUPPORTED_LANGS = ["hr", "en", "de"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const CATALOGS: Record<Lang, Record<string, string>> = {
  hr: hr as Record<string, string>,
  en: en as Record<string, string>,
  de: de as Record<string, string>,
};

export function resolveLang(input: string | null | undefined): Lang {
  if (!input) return "hr";
  const lower = input.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LANGS as readonly string[]).includes(lower)
    ? (lower as Lang)
    : "hr";
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER_RE, (_, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function translate(
  lang: string | null | undefined,
  key: string,
  vars?: Record<string, unknown>,
): string {
  const l = resolveLang(lang);
  const tmpl = CATALOGS[l][key] ?? CATALOGS.hr[key] ?? key;
  return interpolate(tmpl, vars);
}

// Exported for the sync-guard test.
export function _catalogsForTests() {
  return { hr, en, de };
}
