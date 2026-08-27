/**
 * BRANA: svaki test koji mockira `react-i18next` mora u lažnom modulu
 * osigurati `initReactI18next` — izravno ili kroz `createReactI18nextMock`
 * iz `src/test/mocks/reactI18next.ts`.
 *
 * Bez toga test puca čim mu lanac uvoza dosegne `src/i18n/index.ts`
 * (`.use(initReactI18next)`), a to ovisi o rasporedu izvođenja po workerima —
 * pa greška zna spavati lokalno i buditi se na CI-ju.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

function collectTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectTestFiles(full, out);
    } else if (/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('mockovi react-i18next su potpuni', () => {
  const files = collectTestFiles(SRC);

  it('nalazi testne datoteke', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('svaki mock react-i18next osigurava initReactI18next', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/vi\.mock\(\s*['"]react-i18next['"]/.test(src)) continue;

      const hasDirect = src.includes('initReactI18next');
      const hasHelper = src.includes('createReactI18nextMock');
      if (!hasDirect && !hasHelper) {
        offenders.push(path.relative(SRC, file));
      }
    }

    expect(
      offenders,
      offenders.length
        ? `Ove testne datoteke mockiraju 'react-i18next' bez initReactI18next.\n` +
            offenders.map((f) => `  - src/${f}`).join('\n') +
            `\nPopravak: u tvornicu mocka dodaj \`...createReactI18nextMock(),\` ` +
            `iz '@/test/mocks/reactI18next'.`
        : undefined,
    ).toEqual([]);
  });
});
