/**
 * Opis transakcije podmirenja u Krugu gradi SQL (krug_settlement_description).
 * Ovaj test drži te SQL tekstove doslovno jednakima ključu
 * krug.settlement.transactionDescription u hr/en/de, i provjerava da opis
 * nikad ne sadrži naziv Kruga.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import hr from '../locales/hr.json';
import en from '../locales/en.json';
import de from '../locales/de.json';

const MIGRATIONS = path.resolve(__dirname, '../../../drizzle/migrations');

function latestDescriptionSql(): string {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) =>
      fs
        .readFileSync(path.join(MIGRATIONS, f), 'utf8')
        .includes('CREATE OR REPLACE FUNCTION public.krug_settlement_description'),
    );
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS, files[files.length - 1]), 'utf8');
}

type Locale = { krug: { settlement: { transactionDescription: string } } };

describe('krug settlement description parity', () => {
  const sql = latestDescriptionSql();
  const cases: Array<[string, Locale]> = [
    ['hr', hr as unknown as Locale],
    ['en', en as unknown as Locale],
    ['de', de as unknown as Locale],
  ];

  it.each(cases)('%s catalog text matches SQL', (_lang, locale) => {
    const tpl = locale.krug.settlement.transactionDescription;
    expect(tpl).toMatch(/\{\{name\}\}$/);
    const prefix = tpl.replace('{{name}}', '');
    expect(sql).toContain(`'${prefix}' || v_name`);
  });

  it('description template carries no Krug name placeholder', () => {
    for (const [, locale] of cases) {
      const tpl = locale.krug.settlement.transactionDescription;
      expect(tpl).not.toMatch(/\{\{(krug|circle|group)/i);
    }
  });
});
