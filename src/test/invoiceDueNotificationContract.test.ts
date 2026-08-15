import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildI18nPushArgs, resolvePushText } from '../../supabase/functions/_shared/pushPayload';

const vars = { supplier: 'Dobavljač', amount: '12,00 €', date: '15.08.2026.' };

describe('invoice_due push ugovor', () => {
  for (const lang of ['hr', 'en', 'de']) {
    it(`razrješava title/body i varijable za ${lang}`, () => {
      const args = buildI18nPushArgs({
        userId: 'u1',
        titleKey: 'notifications.invoice_due.today.title',
        bodyKey: 'notifications.invoice_due.today.message',
        titleVars: vars,
        messageVars: vars,
        data: { type: 'invoice_due' },
        source: 'test',
      });
      const text = resolvePushText({ lang, title: args.title, body: args.body, data: args.data });
      expect(text.title).not.toContain('notifications.invoice_due');
      expect(text.body).toContain('Dobavljač');
      expect(text.body).toContain('12,00 €');
      expect(text.body).toContain('15.08.2026.');
    });
  }

  it('brana odbija sirovi ključ bez key+vars ugovora', () => {
    expect(() => resolvePushText({
      lang: 'hr',
      title: 'notifications.invoice_due.today.title',
      body: 'Običan tekst',
      data: {},
    })).toThrow('raw_i18n_title');
  });

  it('sender koristi zajednički builder i ne šalje staru /dokumenti metu', () => {
    const src = readFileSync('supabase/functions/invoice-due-reminders/index.ts', 'utf8');
    expect(src).toContain('buildI18nPushArgs');
    expect(src).toContain('entity_type: "incoming_invoice"');
    expect(src).toContain('entity_id: inv.id');
    expect(src).not.toContain('i18n_vars');
    expect(src).not.toContain('route: "/dokumenti"');
    expect(src).not.toContain('translate("hr"');
  });
});