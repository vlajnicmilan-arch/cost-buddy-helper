/**
 * Grep guard: sistemski dijalozi (window.prompt/confirm/alert) su zabranjeni u src/**.
 * Umjesto njih koristi ConfirmActionDialog (ili namjenski dijalog u stilu aplikacije).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");
const ALLOWLIST = new Set([
  path.join(SRC, "components", "common", "ConfirmActionDialog.tsx"),
  path.join(SRC, "test", "noWindowPrompts.test.ts"),
]);
const RE = /\bwindow\s*\.\s*(prompt|confirm|alert)\s*\(/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("no native window dialogs in src/**", () => {
  it("finds no window.prompt/confirm/alert calls", () => {
    const offenders = walk(SRC)
      .filter((f) => !ALLOWLIST.has(f))
      .filter((f) => RE.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    expect(
      offenders,
      `Use ConfirmActionDialog instead of native dialogs: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
