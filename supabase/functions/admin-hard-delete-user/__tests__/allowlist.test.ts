// Unit tests for the email allowlist guard in admin-hard-delete-user.
// Pure logic — no network, no Supabase client.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isEmailAllowed } from "../allowlist.ts";

Deno.test("allows explicit email vinkabalance@gmail.com", () => {
  assertEquals(isEmailAllowed("vinkabalance@gmail.com"), true);
});

Deno.test("allows explicit email case-insensitively", () => {
  assertEquals(isEmailAllowed("VinkaBalance@Gmail.com"), true);
});

Deno.test("allows any @test.vmbalance.com address", () => {
  assertEquals(isEmailAllowed("anyone@test.vmbalance.com"), true);
  assertEquals(isEmailAllowed("e2e+run42@test.vmbalance.com"), true);
});

Deno.test("rejects regular gmail addresses", () => {
  assertEquals(isEmailAllowed("someone@gmail.com"), false);
  assertEquals(isEmailAllowed("hr.akrobat@gmail.com"), false);
});

Deno.test("rejects +test/+e2e tricks on non-allowlisted domains", () => {
  assertEquals(isEmailAllowed("user+test@gmail.com"), false);
  assertEquals(isEmailAllowed("user+e2e@example.com"), false);
});

Deno.test("rejects lookalike domains", () => {
  assertEquals(isEmailAllowed("anyone@vmbalance.com"), false);
  assertEquals(isEmailAllowed("anyone@test-vmbalance.com"), false);
  assertEquals(isEmailAllowed("anyone@vmbalance.test"), false);
});

Deno.test("rejects empty / null / undefined", () => {
  assertEquals(isEmailAllowed(""), false);
  assertEquals(isEmailAllowed("   "), false);
  assertEquals(isEmailAllowed(null), false);
  assertEquals(isEmailAllowed(undefined), false);
});
