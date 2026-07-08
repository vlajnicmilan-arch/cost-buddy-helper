import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import hrMaster from "../locales/hr.json";
import enMaster from "../locales/en.json";
import deMaster from "../locales/de.json";
import { UNTRANSLATED_LOCALE_WHITELIST } from "./untranslatedLocaleWhitelist";

type Lang = "en" | "de";

const LOCALES: Record<Lang, unknown> = {
  en: enMaster,
  de: deMaster,
};

const HR_DIACRITICS_RE = /[čćšžđČĆŠŽĐ]/;
const HR_WORDS = [
  "aplikaciji", "ažuriraj", "ažurirano", "bez", "budžet", "budžeta", "član", "člana", "članove", "članovi",
  "čekanju", "dnevni", "dobiti", "dodaj", "dodano", "dodao", "dodala", "dodijeljeno", "dohvaćanju",
  "emaila", "evidencija", "faza", "faze", "financije", "generiraj", "gdje", "greška", "isplata", "iznos",
  "jezik", "kartica", "kategorija", "kategorijama", "korisnik", "lozinka", "mjesec", "mod", "naziv",
  "obavijest", "obriši", "odaberi", "opis", "opcionalno", "osobne", "plaćanja", "početne", "poništi",
  "popis", "poslovni", "potvrdi", "povratak", "pozovi", "prihod", "prsta", "račun", "računa", "radnika",
  "raste", "rezervi", "ručno", "sažetak", "sigurnost", "slanja", "spremi", "spremanje", "suradnika",
  "trošak", "ukupni", "ukupno", "unesite", "unos", "uspješno", "vidjeti", "vrijeme", "vrijedi",
  "zaključaj", "zaključano", "završeno",
];
const HR_WORD_RE = new RegExp(`(?<![\\p{L}])(?:${HR_WORDS.join("|")})(?![\\p{L}])`, "iu");

function flatten(root: unknown, prefix = ""): Array<[string, string]> {
  if (typeof root === "string") return [[prefix, root]];
  if (Array.isArray(root)) {
    return root.flatMap((value, index) => flatten(value, `${prefix}[${index}]`));
  }
  if (root && typeof root === "object") {
    return Object.entries(root as Record<string, unknown>).flatMap(([key, value]) =>
      flatten(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

function lookup(root: unknown, dottedOrIndexedKey: string): string | undefined {
  const parts = dottedOrIndexedKey.split(".");
  let cur: unknown = root;
  for (const part of parts) {
    const match = part.match(/^([^\[]+)((?:\[\d+\])*)$/);
    if (!match || !cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[match[1]];
    const indexes = [...match[2].matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    for (const index of indexes) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[index];
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("translated master locales do not contain Croatian leftovers", () => {
  for (const lang of ["en", "de"] as const) {
    it(`${lang}.json has no untranslated Croatian values outside whitelist`, () => {
      const whitelist = UNTRANSLATED_LOCALE_WHITELIST[lang];
      const failures: string[] = [];

      for (const [key, value] of flatten(LOCALES[lang])) {
        if (key in whitelist) continue;
        const hrValue = lookup(hrMaster, key);
        const reasons: string[] = [];
        if (typeof hrValue === "string" && value === hrValue) reasons.push("identical-to-hr");
        if (HR_DIACRITICS_RE.test(value)) reasons.push("hr-diacritic");
        const hrWord = value.match(HR_WORD_RE)?.[0];
        if (hrWord) reasons.push(`hr-word:${hrWord}`);
        if (reasons.length > 0) failures.push(`${key} [${reasons.join(", ")}]: ${value}`);
      }

      expect(failures, failures.join("\n")).toEqual([]);
    });

    it(`${lang} untranslated whitelist entries are explicit and still needed`, () => {
      const stale = Object.keys(UNTRANSLATED_LOCALE_WHITELIST[lang]).filter((key) => lookup(LOCALES[lang], key) === undefined);
      expect(stale, stale.join("\n")).toEqual([]);
    });
  }

  it("Croatian t() fallback strings have translated EN/DE keys", () => {
    const files: string[] = [];
    const scopedFiles = [
      "src/components/projects/ProjectMembersTab.tsx",
      "src/pages/JoinProject.tsx",
      "src/components/NotificationsDropdown.tsx",
      "src/components/budget/BudgetMembersTab.tsx",
      "src/components/budget/BudgetFullScreenView.tsx",
      "src/components/budget/BudgetDetailDialog.tsx",
      "src/components/settings/NotificationsSection.tsx",
      "src/components/settings/SecuritySection.tsx",
      "src/components/projects/ProjectWorkersTab.tsx",
      "src/components/projects/WorkCalendarOverview.tsx",
      "src/components/projects/ProjectWorkerDialog.tsx",
      "src/components/projects/WeeklyWorkEntryForm.tsx",
      "src/components/projects/WorkerScheduleDialog.tsx",
    ].map((file) => path.resolve(file));
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && scopedFiles.includes(full)) files.push(full);
      }
    };
    visit(path.resolve("src"));

    const callRe = /\bt\(\s*['"]([^'"]+)['"]\s*,\s*(['"])(.*?)\2/gs;
    const failures: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(callRe)) {
        const key = match[1];
        const fallback = match[3];
        const hasCroatianFallback = HR_DIACRITICS_RE.test(fallback) || HR_WORD_RE.test(fallback);
        if (!hasCroatianFallback) continue;
        const missing = (["en", "de"] as const).filter((lang) => lookup(LOCALES[lang], key) === undefined);
        if (missing.length > 0) {
          const line = source.slice(0, match.index).split("\n").length;
          failures.push(`${path.relative(process.cwd(), file)}:${line} ${key} missing ${missing.join("/")}: ${fallback}`);
        }
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  });
});