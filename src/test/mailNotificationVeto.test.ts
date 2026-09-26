import { describe, expect, it } from 'vitest';
import {
  NOTICE_PLATFORM,
  NOTICE_TRANSACTION,
  detectNotice,
} from '../../supabase/functions/_shared/mailImport/notificationSignals.ts';
import { classifyDocument } from '../../supabase/functions/_shared/mailImport/classify.ts';
import { loadMailFixture, OWN_OIBS } from './mailClassifyFixtures';

/**
 * Živi kvar (rujan 2026): obavijesti bez privitka postajale su `racun`.
 * Doslovna tijela stavki iz baze — pozitivni i negativni slučajevi.
 */

const notice = (id: string) => {
  const m = loadMailFixture(id);
  return detectNotice({ subject: m.subject, bodyText: m.body, hasDocument: false });
};

describe('obavijest bez privitka nije račun', () => {
  it.each([
    ['ba48dd89', 'Paddle Transaction billed'],
    ['1066ffc9', 'Paddle Transaction created'],
    ['5eab9581', 'Paddle Transaction completed'],
    ['ca09e040', 'Anthropic subscription paused'],
    ['6d2c84be', 'FINA obavijest o primitku dokumenta'],
  ])('%s (%s) → obavijest_platforme', (id) => {
    expect(notice(id)).toBe(NOTICE_PLATFORM);
  });

  it.each([
    ['9da246b9', 'Transakcija: George App'],
    ['014d14fa', 'NetBanking: MILAN VLAJNIĆ'],
  ])('%s (%s) → obavijest_o_transakciji', (id) => {
    expect(notice(id)).toBe(NOTICE_TRANSACTION);
  });

  it.each([
    ['40ba3a3e', 'Meta receipt (PayPal)'],
    ['88ffc86c', 'Meta receipt (PayPal)'],
    ['c5cfb45a', 'Bolt vožnja'],
    ['bc4630e1', 'Airbnb rezervacija s računom'],
  ])('%s (%s) ostaje kandidat za račun', (id) => {
    expect(notice(id)).toBeNull();
  });

  it('privitak se nikad ne proglašava obaviješću po tijelu', () => {
    const m = loadMailFixture('9da246b9');
    expect(detectNotice({ subject: m.subject, bodyText: m.body, hasDocument: true })).toBeNull();
  });
});

describe('klasifikacija: obavijest ide u nije_za_nas bez AI poziva', () => {
  const run = (id: string, userClassification: 'racun' | null = null) => {
    const m = loadMailFixture(id);
    return classifyDocument(
      {
        sniffed: 'unknown',
        subject: m.subject,
        fromHeader: m.from,
        bodyText: m.body,
        ownOibs: OWN_OIBS,
        knownOibs: ['23057039320'],
        userClassification,
      },
      {
        parseUbl: () => ({}),
        analyzeWithAi: async () => ({ classification: 'racun', extraction: {}, confidence: 'visoka' }),
      },
    );
  };

  it.each(['ba48dd89', '9da246b9', '014d14fa', 'ca09e040', '6d2c84be'])('%s', async (id) => {
    const r = await run(id);
    expect(r.classification).toBe('nije_za_nas');
    expect(r.aiCalls).toBe(0);
    expect(r.extraction?.notice_reason).toBeTruthy();
  });

  it('korisnikova odluka „račun" je jača od pravila', async () => {
    const r = await run('9da246b9', 'racun');
    expect(r.classification).toBe('racun');
  });

  it.each(['40ba3a3e', 'c5cfb45a', 'bc4630e1'])('%s ostaje račun kad AI kaže račun', async (id) => {
    const r = await run(id);
    expect(r.classification).toBe('racun');
  });
});
