// Sync-guard: server-side notification catalog (supabase/functions/_shared/i18n)
// MUST be a strict subset of src/i18n/locales/*.json with identical placeholders.
//
// This test fails if:
//   - a server catalog key is missing from any master locale
//   - the master locale value uses a different placeholder set than the server
//     catalog value (extra/missing {{var}} names)
//
// Master locale = src/i18n/locales/{hr,en,de}.json (source of truth).
// Server catalog = supabase/functions/_shared/i18n/{hr,en,de}.ts (subset for
// edge functions where in-DB triggers or edge fns need the localized text
// before the client renders it — currently push notifications).
import { describe, it, expect } from "vitest";
import hrMaster from "../locales/hr.json";
import enMaster from "../locales/en.json";
import deMaster from "../locales/de.json";
import hrServer from "../../../supabase/functions/_shared/i18n/hr";
import enServer from "../../../supabase/functions/_shared/i18n/en";
import deServer from "../../../supabase/functions/_shared/i18n/de";

const MASTERS: Record<"hr" | "en" | "de", unknown> = {
  hr: hrMaster,
  en: enMaster,
  de: deMaster,
};
const SERVERS: Record<"hr" | "en" | "de", Record<string, string>> = {
  hr: hrServer as Record<string, string>,
  en: enServer as Record<string, string>,
  de: deServer as Record<string, string>,
};

function lookupDeep(root: unknown, dottedKey: string): string | undefined {
  const parts = dottedKey.split(".");
  let cur: unknown = root;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
function placeholders(s: string): Set<string> {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((m = re.exec(s)) !== null) out.add(m[1]);
  return out;
}

describe("server notification catalog is a subset of master locales", () => {
  const langs = ["hr", "en", "de"] as const;

  it("all server catalogs share the same key set", () => {
    const hrKeys = Object.keys(SERVERS.hr).sort();
    const enKeys = Object.keys(SERVERS.en).sort();
    const deKeys = Object.keys(SERVERS.de).sort();
    expect(enKeys).toEqual(hrKeys);
    expect(deKeys).toEqual(hrKeys);
  });

  for (const lang of langs) {
    describe(`${lang}`, () => {
      const serverCat = SERVERS[lang];
      const master = MASTERS[lang];
      for (const key of Object.keys(serverCat)) {
        it(`master locale contains "${key}"`, () => {
          const masterValue = lookupDeep(master, key);
          expect(
            masterValue,
            `Missing key "${key}" in src/i18n/locales/${lang}.json — server catalog uses it. Add it to the master locale or remove it from supabase/functions/_shared/i18n/${lang}.ts.`,
          ).toBeTypeOf("string");
        });

        it(`placeholders for "${key}" match master`, () => {
          const masterValue = lookupDeep(master, key);
          if (typeof masterValue !== "string") return; // reported by previous test
          const serverPh = placeholders(serverCat[key]);
          const masterPh = placeholders(masterValue);
          expect(
            [...masterPh].sort(),
            `Placeholder mismatch for "${key}" (${lang}): master=${JSON.stringify([...masterPh])} server=${JSON.stringify([...serverPh])}`,
          ).toEqual([...serverPh].sort());
        });
      }
    });
  }
});
