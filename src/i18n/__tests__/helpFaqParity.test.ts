/**
 * Guard for the user-facing guide (help.*) and FAQ (faq.*) blocks.
 *
 * 1) Key parity: hr/en/de must expose the exact same key sets, otherwise a
 *    language silently renders the raw key or an English leftover.
 * 2) Scope rule (Milan, 2026): the guide must describe ONLY what is active for
 *    an ordinary user today. No business module, no e-invoices, no business
 *    profiles, no bank connection (Enable Banking), no "simple mode".
 */
import { describe, expect, it } from "vitest";
import hr from "../locales/hr.json";
import en from "../locales/en.json";
import de from "../locales/de.json";

type Lang = "hr" | "en" | "de";
const LOCALES: Record<Lang, Record<string, unknown>> = {
  hr: hr as Record<string, unknown>,
  en: en as Record<string, unknown>,
  de: de as Record<string, unknown>,
};
const LANGS: Lang[] = ["hr", "en", "de"];
const BLOCKS = ["help", "faq"] as const;

function flatten(root: unknown, prefix = ""): Array<[string, string]> {
  if (typeof root === "string") return [[prefix, root]];
  if (root && typeof root === "object") {
    return Object.entries(root as Record<string, unknown>).flatMap(([key, value]) =>
      flatten(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

const FORBIDDEN: RegExp[] = [
  /enable banking/i,
  /bankovn\w* poveznic/i,
  /povezivanje s bankom/i,
  /bankverbindung/i,
  /bank connection/i,
  /poslovni\w* nač?in/i,
  /business mode/i,
  /geschäftsmodus/i,
  /poslovn\w* profil/i,
  /business profile/i,
  /geschäftsprofil/i,
  /e-?račun/i,
  /e-?invoice/i,
  /e-?rechnung/i,
  /jednostavn\w* nač?in/i,
  /simple mode/i,
  /einfacher modus/i,
  /R-1/,
];

describe("help.* and faq.* stay in parity and in scope", () => {
  for (const block of BLOCKS) {
    it(`${block}.* key sets are identical across hr/en/de`, () => {
      const sets = LANGS.map((lang) => flatten(LOCALES[lang][block]).map(([k]) => k).sort());
      expect(sets[1], `en diverges from hr in ${block}.*`).toEqual(sets[0]);
      expect(sets[2], `de diverges from hr in ${block}.*`).toEqual(sets[0]);
    });

    for (const lang of LANGS) {
      it(`${lang} ${block}.* mentions nothing inactive`, () => {
        const failures = flatten(LOCALES[lang][block])
          .filter(([, value]) => FORBIDDEN.some((re) => re.test(value)))
          .map(([key, value]) => `${block}.${key}: ${value}`);
        expect(failures, failures.join("\n")).toEqual([]);
      });
    }
  }
});
