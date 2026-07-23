import { test, expect } from '@playwright/test';
import { authedClientFor, edgeFn, admin } from '../helpers/clients';
import { createExpense } from '../helpers/fixtures';

/**
 * AI i izvozi: rubni pozivi moraju biti scope-ani na pozivatelja.
 *
 * NAPOMENA: NE pokrećemo skupi happy-path (nula Gemini poziva, nula stvarnih
 * Paddle poziva). Testiramo samo auth guard i scope filtera.
 */
test.describe('06 — AI + izvozi', () => {
  let aId: string; let bId: string;
  let aClient: any; let bClient: any;
  let aToken: string; let bToken: string;

  test.beforeAll(async () => {
    const A = await authedClientFor('a'); aId = A.userId; aClient = A.client; aToken = A.accessToken;
    const B = await authedClientFor('b'); bId = B.userId; bClient = B.client; bToken = B.accessToken;
    // A ima expense; B nema.
    await createExpense(aClient, aId, { amount: 777, description: 'a-private' });
  });

  test.afterAll(async () => {
    await admin().from('expenses').delete().eq('user_id', aId);
    await admin().from('chat_messages').delete().eq('user_id', aId);
    await admin().from('chat_messages').delete().eq('user_id', bId);
  });

  test('financial-assistant bez JWT-a → 401', async () => {
    const r = await edgeFn('financial-assistant',
      { message: 'summarize', sessionId: 'x' }, { token: null });
    expect(r.status, r.text).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain(r.status);
  });

  test('financial-assistant NE prihvaća user_id iz bodyja — koristi JWT sub', async () => {
    // B poziva s podmetnutim user_id: aId → mora dobiti SVOJ scope (prazno)
    const r = await edgeFn(
      'financial-assistant',
      { message: 'Prikaži zadnjih 5 transakcija', sessionId: 'sec-test', user_id: aId },
      { token: bToken },
    );
    // Ne validiramo AI output (nema Gemini poziva), samo tvrdimo da nije doslo do curenja
    // preko chat historyja: nakon poziva, chat_messages za bId ne sadrži A-in privatni opis.
    const { data } = await admin()
      .from('chat_messages').select('content').eq('user_id', bId);
    for (const row of data ?? []) {
      expect(String(row.content ?? '')).not.toContain('a-private');
    }
    // Response može biti 200/402/500 — nije bitno; bitno je da NEMA A-inih podataka u bijelom scopeu.
    expect([200, 400, 402, 429, 500, 502]).toContain(r.status);
  });

  test('paddle-portal-url bez JWT → 401', async () => {
    const r = await edgeFn('paddle-portal-url', {}, { token: null });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain(r.status);
  });

  test('paddle-portal-url NE prihvaća user_id iz bodyja', async () => {
    // B forsira A-in user_id — mora završiti na SVOJEM (ili greška)
    const r = await edgeFn(
      'paddle-portal-url',
      { user_id: aId }, // spoof pokušaj
      { token: bToken },
    );
    // Očekujemo da URL ako i vrati nešto, referira B-inog customera (ili "no customer")
    // Konkretno: response ne smije sadržavati A-in email/id
    expect(r.text).not.toContain(aId);
  });

  test('list-users bez admin uloge → 403', async () => {
    const r = await edgeFn('list-users', {}, { token: bToken });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain(r.status);
  });

  test('admin-manage-user bez admin uloge → 403', async () => {
    const r = await edgeFn('admin-manage-user',
      { action: 'delete', user_id: aId }, { token: bToken });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect([401, 403]).toContain(r.status);
  });
});
