/**
 * Two-way guard (the missing direction of serverCatalogSync.test.ts).
 *
 * serverCatalogSync checks   server ⊆ master   (every server key exists in locales).
 * This test checks the OTHER direction: every notification i18n key that edge
 * functions actually USE must exist in ALL THREE server catalogs
 * (supabase/functions/_shared/i18n/{hr,en,de}.ts).
 *
 * Without this, a key added to src/i18n/locales/*.json but forgotten in the
 * server catalog silently ships the raw key to the user's phone
 * (translate() falls back to returning the key) — exactly what happened with
 * notifications.krug.{invited,invitation_accepted,member_left}.* on 2026-08-08.
 *
 * Coverage:
 *  - every static "notifications.*" string literal in supabase/functions/**
 *  - the dynamically built `notifications.krug.<shortKey>.{title,message}`,
 *    expanded from the event_type_shortKey() map in notify-krug-event.
 *
 * A key is considered satisfied when the catalog holds either the exact key
 * or the prefix pair `<key>.title` + `<key>.body` (used by decisions reminders,
 * where the code appends the suffix at call time).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import hrServer from "../../../supabase/functions/_shared/i18n/hr";
import enServer from "../../../supabase/functions/_shared/i18n/en";
import deServer from "../../../supabase/functions/_shared/i18n/de";

const FUNCTIONS_DIR = path.resolve(__dirname, "../../../supabase/functions");
const CATALOG_DIR = path.join(FUNCTIONS_DIR, "_shared", "i18n");

const SERVERS: Record<"hr" | "en" | "de", Record<string, string>> = {
  hr: hrServer as Record<string, string>,
  en: enServer as Record<string, string>,
  de: deServer as Record<string, string>,
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.startsWith(CATALOG_DIR)) continue; // catalogs themselves
      out.push(...walk(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const LITERAL_RE = /["'`](notifications\.[A-Za-z0-9_.]+)["'`]/g;

function collectUsedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of walk(FUNCTIONS_DIR)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(LITERAL_RE)) keys.add(m[1]);
  }

  // Dynamic: notifications.krug.${event_type_shortKey(event_type)}.{title,message}
  const krugSrc = fs.readFileSync(
    path.join(FUNCTIONS_DIR, "notify-krug-event", "index.ts"),
    "utf8",
  );
  const shortKeys = [...krugSrc.matchAll(/return\s+"([a-z_]+)";/g)].map((m) => m[1]);
  expect(shortKeys.length, "failed to parse event_type_shortKey map").toBeGreaterThan(5);
  for (const sk of shortKeys) {
    keys.add(`notifications.krug.${sk}.title`);
    keys.add(`notifications.krug.${sk}.message`);
  }
  return keys;
}

function satisfied(cat: Record<string, string>, key: string): boolean {
  if (key in cat) return true;
  return `${key}.title` in cat && `${key}.body` in cat; // prefix form
}

const USED = [...collectUsedKeys()].sort();

describe("server i18n catalog covers every key used by edge functions", () => {
  it("collected a non-trivial key set", () => {
    expect(USED.length).toBeGreaterThan(20);
  });

  for (const lang of ["hr", "en", "de"] as const) {
    it(`${lang}.ts contains every used key`, () => {
      const missing = USED.filter((k) => !satisfied(SERVERS[lang], k));
      expect(
        missing,
        `Missing in supabase/functions/_shared/i18n/${lang}.ts: ${missing.join(", ")}. ` +
          `Push notifications would ship the raw key to users. Copy the value from src/i18n/locales/${lang}.json.`,
      ).toEqual([]);
    });
  }
});
