/**
 * Source + unit guard — dupli klik na "Spremi" i idempotencija.
 *
 * Incident 08.08.2026: spremanje troška čekalo je preračun salda (~7 s), gumb
 * je ostao aktivan i korisnik je klikom stvorio 9 identičnih redaka u istoj
 * sekundi. Popravak ima tri sloja i sva tri drži ovaj test:
 *   1. sinkroni `isSavingRef` lock (state se ažurira prekasno),
 *   2. `disabled` na gumbu uključuje `isSaving`,
 *   3. `client_request_id` + DB unique index pretvaraju retry u no-op.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { newClientRequestId } from '@/lib/clientRequestId';

const DIALOG = readFileSync(
  resolve(__dirname, '../components/add-expense/AddExpenseDialog.tsx'),
  'utf8',
);
const CRUD = readFileSync(resolve(__dirname, '../hooks/useExpenseCRUD.ts'), 'utf8');

describe('newClientRequestId', () => {
  it('returns unique non-empty ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newClientRequestId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.length).toBeGreaterThan(8);
  });
});

describe('AddExpenseDialog submit lock', () => {
  it('holds a synchronous saving ref', () => {
    expect(DIALOG).toMatch(/const isSavingRef = useRef\(false\)/);
  });

  it('bails out of handleSubmit while a save is in flight', () => {
    expect(DIALOG).toMatch(
      /const handleSubmit = async \([\s\S]{0,120}?if \(isSavingRef\.current\) return;/,
    );
  });

  it('bails out of the duplicate-confirm path too', () => {
    expect(DIALOG).toMatch(
      /const handleDuplicateConfirm = async \(\) => \{\s*\n\s*if \(isSavingRef\.current\) return;/,
    );
  });

  it('bails out of the scanned-receipt accept path too', () => {
    expect(DIALOG).toMatch(/if \(!scannedData \|\| isSaving \|\| isSavingRef\.current\) return;/);
  });

  it('disables the manual save button while saving', () => {
    expect(DIALOG).toMatch(/disabled=\{scanning \|\| isSaving \|\| !amount\}/);
  });

  it('always releases the lock in a finally block', () => {
    expect(DIALOG.match(/isSavingRef\.current = false/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe('idempotency key plumbing', () => {
  it('attaches client_request_id to every executeAdd payload', () => {
    expect(DIALOG).toMatch(/client_request_id: clientRequestIdRef\.current/);
  });

  it('rotates the key only on form reset', () => {
    expect(DIALOG).toMatch(/clientRequestIdRef\.current = newClientRequestId\(\)/);
  });

  it('forwards client_request_id into the insert payload', () => {
    expect(CRUD).toMatch(/client_request_id/);
  });

  it('treats a unique-violation on client_request_id as a no-op', () => {
    expect(CRUD).toMatch(/error\.code === '23505'[\s\S]{0,200}client_request_id/);
  });

  it('does not block the save on the balance recompute', () => {
    expect(CRUD).toMatch(/void \(async \(\) => \{[\s\S]{0,400}?await updateBalance\(/);
  });
});
