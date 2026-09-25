import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assignTreeCategory, clientWantsTree, SERVER_CATEGORY_TREE_ENABLED } from "../categoryAutoAssign.ts";

const base = {
  userId: "u-1",
  direction: "expense" as const,
  customCategories: [],
};

Deno.test("prekidač je zadano isključen", () => {
  assertEquals(SERVER_CATEGORY_TREE_ENABLED, false);
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
