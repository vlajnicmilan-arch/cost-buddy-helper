/**
 * ČUVAR: sažetak sudionika nikad ne smije prikazati sirovu programsku oznaku
 * vrste događaja (npr. "project_transaction_created") u korisničkom tekstu.
 */
import { describe, it, expect } from "vitest";
import {
  DIGEST_EVENT_KINDS,
  buildSummaryBodySelection,
  digestKindLabel,
  pluralForm,
} from "@/lib/digestSummary";
import { translate } from "../../supabase/functions/_shared/i18n/index";

const SNAKE = /[a-z]+_[a-z_]+/;
const LANGS = ["hr", "en", "de"] as const;

describe("digest event kind translation", () => {
  for (const lang of LANGS) {
    it(`${lang}: sve poznate vrste + nepoznata su prevedene`, () => {
      for (const kind of [...DIGEST_EVENT_KINDS, "posve_nepoznata_vrsta"]) {
        const label = digestKindLabel(lang, kind);
        expect(label).not.toContain("notifications.");
        expect(SNAKE.test(label), `${lang}/${kind} -> ${label}`).toBe(false);
      }
    });

    it(`${lang}: sastavljeni samples nema snake_case niza`, () => {
      const summary = [...DIGEST_EVENT_KINDS, "nepoznata_vrsta_dogadjaja"].map((kind) => ({
        kind,
        actor_name: "Vinka",
        label: "Podno grijanje Solin",
      }));
      for (let i = 0; i < summary.length; i++) {
        const sel = buildSummaryBodySelection(summary.length, summary.slice(i), lang);
        const rendered = translate(lang, sel.key, sel.vars);
        expect(rendered).not.toContain("notifications.");
        expect(SNAKE.test(rendered), `${lang}: ${rendered}`).toBe(false);
      }
    });
  }

  it("nepoznata vrsta pada na generičku oznaku", () => {
    expect(digestKindLabel("hr", "nesto_novo")).toBe("promjena");
    expect(digestKindLabel("en", "nesto_novo")).toBe("change");
    expect(digestKindLabel("de", "nesto_novo")).toBe("Änderung");
  });

  it("project_transaction_created se prevodi", () => {
    expect(digestKindLabel("hr", "project_transaction_created")).toBe("nova transakcija");
  });
});

describe("croatian plural in digest header", () => {
  const cases: Array<[number, string]> = [
    [1, "1 nova promjena"],
    [2, "2 nove promjene"],
    [4, "4 nove promjene"],
    [5, "5 novih promjena"],
    [11, "11 novih promjena"],
    [21, "21 nova promjena"],
    [22, "22 nove promjene"],
  ];
  it.each(cases)("hr count=%i", (count, expected) => {
    const sel = buildSummaryBodySelection(count, [], "hr");
    expect(translate("hr", sel.key, sel.vars)).toContain(expected);
  });

  it("en/de koriste one/other", () => {
    expect(pluralForm("en", 22)).toBe("many");
    expect(translate("en", buildSummaryBodySelection(1, [], "en").key, { count: 1 })).toContain(
      "1 new change",
    );
    expect(translate("de", buildSummaryBodySelection(3, [], "de").key, { count: 3 })).toContain(
      "3 neue Änderungen",
    );
  });
});
