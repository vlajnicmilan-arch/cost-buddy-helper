import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Čuvar: ishod prijedloga autoru stiže isključivo serverskom obaviješću
// (krug_emit_notification → notify-krug-event, outbox + retry). Klijentski
// detectAuthorOutcome je uklonjen jer je uz REPLICA IDENTITY DEFAULT uvijek
// vraćao null, a uz FULL bi stvorio dvostruki signal.
describe('krug author outcome — klijentski toast uklonjen', () => {
  const src = readFileSync('src/hooks/useExpenseFetch.ts', 'utf8');

  it('useExpenseFetch ne sadrži detectAuthorOutcome ni toast ishoda', () => {
    expect(src).not.toContain('detectAuthorOutcome');
    expect(src).not.toContain('krugAuthorOutcome');
    expect(src).not.toContain('expense_confirmed.toast');
    expect(src).not.toContain('expense_rejected.toast');
  });

  it('krugAuthorOutcome modul i test su obrisani', () => {
    expect(existsSync('src/lib/krugAuthorOutcome.ts')).toBe(false);
    expect(existsSync('src/lib/__tests__/krugAuthorOutcome.test.ts')).toBe(false);
  });

  it('toast ključevi su uklonjeni iz sve tri lokacije, title/message ostaju', () => {
    for (const loc of ['hr', 'en', 'de']) {
      const d = JSON.parse(readFileSync(`src/i18n/locales/${loc}.json`, 'utf8'));
      const k = d.notifications.krug;
      expect(k.expense_confirmed.toast).toBeUndefined();
      expect(k.expense_rejected.toast).toBeUndefined();
      expect(k.expense_confirmed.title).toBeTruthy();
      expect(k.expense_rejected.message).toBeTruthy();
    }
  });
});
