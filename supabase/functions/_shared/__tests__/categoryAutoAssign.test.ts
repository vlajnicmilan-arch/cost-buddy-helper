import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assignTreeCategory, clientWantsTree, SERVER_CATEGORY_TREE_ENABLED } from "../categoryAutoAssign.ts";

const base = {
  userId: "u-1",
  direction: "expense" as const,
  customCategories: [],
};

Deno.test("prekidač je uključen (nalog 6b, objavljeno)", () => {
  assertEquals(SERVER_CATEGORY_TREE_ENABLED, true);
});

Deno.test("bez oznake verzije → stari put", () => {
  assertEquals(clientWantsTree({}), false);
  assertEquals(clientWantsTree({ category_tree_version: 1 }), false);
  assertEquals(clientWantsTree({ category_tree_version: 2 }), true);
});

Deno.test("ispravak korisnika pobjeđuje AI (AI se ne zove)", async () => {
  let called = false;
  const r = await assignTreeCategory({
    ...base,
    row: { merchant_name: "Konzum 123" },
    corrections: [{ user_id: "u-1", corrected_category: "groceries", merchant_name: "KONZUM", created_at: "2026-09-01" }],
    askAi: () => { called = true; return Promise.resolve("fuel"); },
  });
  assertEquals(r.category, "groceries");
  assertEquals(r.learned, true);
  assertEquals(called, false);
});

Deno.test("poništen i tuđi ispravak se ne koriste; AI prolazi provjeru", async () => {
  const r = await assignTreeCategory({
    ...base,
    row: { merchant_name: "Konzum" },
    corrections: [
      { user_id: "u-1", corrected_category: "groceries", merchant_name: "Konzum", created_at: "2026-09-01", reverted_at: "2026-09-02" },
      { user_id: "u-2", corrected_category: "groceries", merchant_name: "Konzum", created_at: "2026-09-03" },
    ],
    askAi: () => Promise.resolve("beauty"),
  });
  assertEquals(r.category, "care");
  assertEquals(r.fromAi, true);
});

Deno.test("nepoznat AI odgovor → rezervni ključ + dijagnostika", async () => {
  const seen: string[] = [];
  const r = await assignTreeCategory({
    ...base,
    row: { description: "x" },
    corrections: [],
    askAi: () => Promise.resolve("banana"),
    onUnknown: (raw) => seen.push(raw),
  });
  assertEquals(r.category, "other");
  assertEquals(seen, ["banana"]);
  assertEquals("movement_kind" in r || "tags" in r, false);
});

Deno.test("bank-sync put: trošak uvijek iz dopuštenog skupa, prihod nikad trošak (nalog 6b)", async () => {
  const seen: string[] = [];
  for (const raw of ["fuel", "coffee", "banana", "salary", "other_income", null]) {
    const r = await assignTreeCategory({
      ...base,
      row: { description: "x" },
      corrections: [],
      askAi: () => Promise.resolve(raw),
      onUnknown: (v) => seen.push(v),
    });
    assertEquals("movement_kind" in r || "tags" in r, false);
    if (raw === null) assertEquals(r.category, "other");
  }
  // trošak: AI „salary" (prihod) se odbija → rezervni ključ
  const exp = await assignTreeCategory({
    ...base,
    row: { description: "x" },
    corrections: [],
    askAi: () => Promise.resolve("salary"),
  });
  assertEquals(exp.category, "other");
  // prihod: AI „groceries" (trošak) se odbija → rezervni ključ prihoda
  const inc = await assignTreeCategory({
    ...base,
    direction: "income",
    row: { description: "x" },
    corrections: [],
    askAi: () => Promise.resolve("groceries"),
  });
  assertEquals(["salary", "work_income", "refunds", "other_income"].includes(inc.category), true);
  assertEquals(inc.category, "other_income");
});
