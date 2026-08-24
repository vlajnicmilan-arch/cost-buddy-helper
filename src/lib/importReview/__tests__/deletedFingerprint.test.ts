/**
 * RANIJE OBRISANI REDAK — treće stanje otiska.
 *
 * Jedinstveni indeks `uniq_expenses_user_bank_tx` ne mari za `deleted_at`, pa
 * otisak obrisanog retka ostaje zauzet. Priprema uvoza to mora znati PRIJE
 * ijednog upisa: takav redak se preskače kao ISPUNJEN ishod (nikad 23505), a
 * vraća se isključivo svjesnom radnjom "Vrati u knjige".
 *
 * Otisci u testu su doslovni iz žive baze (korisnik d4d31ee6…, posao abd59543).
 */
import { describe, it, expect } from 'vitest';
import { executeDecisions, planExecution, type ExecutorSupabaseClient } from '../executor';
import { buildInitialDecisions, isPreviouslyDeletedRow, isRestoreDeleted, setRestoreDeleted } from '../state';
import type { ImportReviewDecisions, ImportReviewPayload, SerializedImportedTx } from '../types';

const FP_BAUSTOFF = 'imp:bd72b71a689d0f7fe954997fbf707c594a051905bf0fccac7867469ce7e19adf';
const FP_KERATERM = 'imp:9ca8386850f5da9884fd6fa71f9f7396699117c45484169459231b649645b408';
const FP_FRESH = 'imp:0000000000000000000000000000000000000000000000000000000000000001';

function tx(i: number, fingerprint: string, amount: number): SerializedImportedTx {
  return {
    index: i,
    dateIso: '2026-08-10T00:00:00.000Z',
    amount,
    type: 'expense',
    category: 'Ostalo',
    description: 'desc',
    merchantName: `M${i}`,
    paymentSource: 'custom:src-1',
    balanceAfter: 100,
    bankRowSeq: i,
    fingerprint,
  } as SerializedImportedTx;
}

function newRow(index: number, over: Record<string, unknown> = {}) {
  return {
    index,
    date: '2026-08-10',
    amount: 42.43,
    type: 'expense',
    merchantName: `M${index}`,
    classification: { kind: 'new', existsByFingerprint: false, ...(over.classification as object ?? {}) },
    ...over,
  } as never;
}

function payload(rows: unknown[], txs: SerializedImportedTx[]): ImportReviewPayload {
  return {
    jobId: 'job-1',
    sourceId: 'src-1',
    sourceName: 'Revolut',
    createdAt: 0,
    batchId: 'batch-1',
    availableTargets: [],
    manualCandidates: {},
    rows: rows as never,
    importedTransactions: txs,
  } as ImportReviewPayload;
}

/** Fake klijent: RPC zna tri stanja; upsert bi na obrisanom otisku pao s 23505. */
function makeClient(deleted: Set<string>, live: Set<string>) {
  const upserted: string[] = [];
  const restored: string[] = [];
  const client: ExecutorSupabaseClient & { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async in(_c: string, fps: string[]) {
                  return {
                    data: fps.filter(f => live.has(f)).map(bank_transaction_id => ({ bank_transaction_id, status: null })),
                    error: null,
                  };
                },
              };
            },
          };
        },
        upsert(rows: Array<{ bank_transaction_id: string }>) {
          return {
            async select() {
              for (const r of rows) {
                if (deleted.has(r.bank_transaction_id)) {
                  return { data: null, error: { code: '23505', message: 'uniq_expenses_user_bank_tx' } };
                }
              }
              for (const r of rows) { upserted.push(r.bank_transaction_id); live.add(r.bank_transaction_id); }
              return { data: rows.map(r => ({ id: r.bank_transaction_id })), error: null };
            },
          };
        },
      } as never;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'lookup_import_fingerprints') {
        const fps = (args.p_fingerprints ?? []) as string[];
        return {
          data: fps
            .filter(f => deleted.has(f) || live.has(f))
            .map(f => ({ fingerprint: f, is_deleted: deleted.has(f) && !live.has(f) })),
          error: null,
        };
      }
      if (name === 'restore_deleted_import_row') {
        const fp = args.p_fingerprint as string;
        if (!deleted.has(fp)) return { data: false, error: null };
        deleted.delete(fp);
        live.add(fp);
        restored.push(fp);
        return { data: true, error: null };
      }
      return { data: null, error: { message: 'unknown_rpc' } };
    },
  } as never;
  return { client, upserted, restored };
}

const decisions = (over: Partial<ImportReviewDecisions> = {}): ImportReviewDecisions => ({
  autoMerge: {}, questions: {}, newRows: {}, transfers: {}, ...over,
});

describe('ranije obrisani otisak', () => {
  it('zadano je isključen i ne planira upis', () => {
    const rows = [newRow(0, { classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: true } })];
    const p = payload(rows, [tx(0, FP_BAUSTOFF, 42.43)]);
    const d = buildInitialDecisions(p);
    expect(d.newRows[0]).toBe(false);
    expect(isRestoreDeleted(d, 0)).toBe(false);
    expect(isPreviouslyDeletedRow(rows[0] as never)).toBe(true);

    const plan = planExecution(p, d);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.restores).toHaveLength(0);
    expect(plan.skippedPreviouslyDeleted).toBe(1);
  });

  it('uvoz završava uspješno bez ijednog 23505 kad su redci ranije obrisani', async () => {
    const rows = [
      newRow(0, { classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: true } }),
      newRow(1, { classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: true } }),
      newRow(2),
    ];
    const p = payload(rows, [tx(0, FP_BAUSTOFF, 42.43), tx(1, FP_KERATERM, 23.49), tx(2, FP_FRESH, 10)]);
    const d = decisions({ newRows: { 2: true } });
    const { client, upserted } = makeClient(new Set([FP_BAUSTOFF, FP_KERATERM]), new Set());

    const res = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(res.skippedPreviouslyDeleted).toBe(2);
    expect(res.inserted).toBe(1);
    expect(res.skippedExistingUnique).toBe(0);
    expect(upserted).toEqual([FP_FRESH]);
  });

  it('"Vrati u knjige" oživi stari redak umjesto da stvori drugi zapis', async () => {
    const rows = [newRow(0, { classification: { kind: 'new', existsByFingerprint: false, deletedByFingerprint: true } })];
    const p = payload(rows, [tx(0, FP_BAUSTOFF, 42.43)]);
    const d = setRestoreDeleted(buildInitialDecisions(p), 0, true);
    const { client, upserted, restored } = makeClient(new Set([FP_BAUSTOFF]), new Set());

    const res = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(res.restoredDeleted).toBe(1);
    expect(res.skippedPreviouslyDeleted).toBe(0);
    expect(restored).toEqual([FP_BAUSTOFF]);
    expect(upserted).toEqual([]);
  });

  it('regresija: živi otisak i dalje "već postoji", nepoznati se upisuje', async () => {
    const rows = [
      newRow(0, { classification: { kind: 'new', existsByFingerprint: true } }),
      newRow(1),
    ];
    const p = payload(rows, [tx(0, FP_KERATERM, 23.49), tx(1, FP_FRESH, 10)]);
    const d = decisions({ newRows: { 1: true } });
    const { client, upserted } = makeClient(new Set(), new Set([FP_KERATERM]));

    const res = await executeDecisions({ supabase: client, userId: 'u1', activeBusinessProfileId: null, payload: p, decisions: d });
    expect(res.skippedFingerprint).toBe(1);
    expect(res.skippedPreviouslyDeleted).toBe(0);
    expect(res.inserted).toBe(1);
    expect(upserted).toEqual([FP_FRESH]);
  });
});
