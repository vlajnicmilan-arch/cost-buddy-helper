import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Nalog: ukloniti Crisp u cijelosti i dodati "Piši nam" mailto gumb.
 *
 * (a) src/, index.html i public/ ne smiju sadržavati nijedan spomen
 *     uklonjenog chat servisa (case-insensitive). Riječ je složena iz
 *     dijelova da sam test ne okine vlastiti grep.
 * (b) javne prodajne stranice (baked body HTML izvori) nose gumb čiji
 *     href počinje s mailto:support@vmbalance.com.
 */

const ROOT = join(__dirname, "..", "..");
const BANNED = new RegExp(["c", "r", "i", "s", "p"].join(""), "i");

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
};

const SELF = relative(ROOT, __filename).replace(/\\/g, "/");

describe("chat servis uklonjen", () => {
  it("src/, index.html i public/ nemaju nijedan spomen (case-insensitive)", () => {
    const files = [
      ...walk(join(ROOT, "src")),
      join(ROOT, "index.html"),
      ...walk(join(ROOT, "public")),
    ].filter(
      (f) => /\.(ts|tsx|js|jsx|html|css|json|md|svg|xml|txt)$/i.test(f),
    );

    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (rel === SELF) continue;
      let content: string;
      try {
        content = readFileSync(file, "utf8");
      } catch {
        continue; // binarne datoteke preskoči
      }
      if (BANNED.test(content)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Piši nam gumb na javnim stranicama", () => {
  const BODIES = [
    "src/pages/CentarLanding.body.html",
    "src/pages/CentarLanding.body.en.html",
    "src/pages/CentarLanding.body.de.html",
    "src/pages/ProjektiLanding.body.html",
  ];

  it.each(BODIES)("%s ima contact-fab s mailto hrefom", (rel) => {
    const html = readFileSync(join(ROOT, rel), "utf8");
    const match = html.match(
      /<a[^>]*class="contact-fab"[^>]*href="([^"]+)"/,
    );
    expect(match, `contact-fab gumb nedostaje u ${rel}`).toBeTruthy();
    expect(match![1].startsWith("mailto:support@vmbalance.com")).toBe(true);
  });
});
