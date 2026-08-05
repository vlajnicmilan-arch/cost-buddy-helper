import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml } from "../escapeHtml.ts";

Deno.test("escapes all HTML-significant characters", () => {
  assertEquals(
    escapeHtml(`<script>alert("x")&'</script>`),
    "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&lt;/script&gt;",
  );
});

Deno.test("handles null and undefined", () => {
  assertEquals(escapeHtml(null), "");
  assertEquals(escapeHtml(undefined), "");
});

Deno.test("leaves plain text untouched", () => {
  assertEquals(escapeHtml("Banka je spojena"), "Banka je spojena");
});
