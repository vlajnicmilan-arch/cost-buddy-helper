import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveExpenseWithItems,
  stableSaveId,
  releaseSaveId,
  __resetSaveIds,
  EXPENSE_SAVE_TIMEOUT_MS,
} from '@/lib/expenseSave';
import {
  __resetWeakConnection,
  isWeakConnectionActive,
} from '@/lib/weakConnection';

const noSleep = async () => {};

describe('spremanje troška — jedan krug, rok i jedan ponovni pokušaj', () => {
  beforeEach(() => {
    __resetSaveIds();
    __resetWeakConnection();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uspješan poziv je JEDAN mrežni krug', async () => {
    const rpc = vi.fn().mockResolvedValue({ id: 'e1' });
    const res = await saveExpenseWithItems({ id: 'e1' }, [], { rpc, sleep: noSleep });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(res.outcome).toBe('ok');
    expect(res.attempts).toBe(1);
    expect(res.row).toEqual({ id: 'e1' });
  });

  it('mrežni pad → jedan ponovni pokušaj, pa uspjeh', async () => {
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ id: 'e1' });
    const res = await saveExpenseWithItems({ id: 'e1' }, [], { rpc, sleep: noSleep });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(res.outcome).toBe('retry_ok');
    // Tiha traka se ugasila nakon oporavka.
    expect(isWeakConnectionActive()).toBe(false);
  });

  it('staje nakon drugog pokušaja i javlja broj pokušaja', async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      saveExpenseWithItems({ id: 'e1' }, [], { rpc, sleep: noSleep }),
    ).rejects.toThrow(/Failed to fetch/);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('rok prekida zaglavljeni poziv i pokreće ponovni pokušaj', async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const rpc = vi
      .fn()
      .mockImplementationOnce((_e: unknown, _i: unknown, signal: AbortSignal) => {
        firstSignal = signal;
        return new Promise(() => {
          /* nikad ne odgovara */
        });
      })
      .mockResolvedValue({ id: 'e1' });

    const p = saveExpenseWithItems({ id: 'e1' }, [], { rpc, sleep: noSleep, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    const res = await p;
    expect(firstSignal?.aborted).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(res.outcome).toBe('retry_ok');
  });

  it('poslovna greška (npr. 23505) se ne ponavlja', async () => {
    const err: any = new Error('duplicate key');
    err.code = '23505';
    const rpc = vi.fn().mockRejectedValue(err);
    await expect(
      saveExpenseWithItems({ id: 'e1' }, [], { rpc, sleep: noSleep }),
    ).rejects.toThrow(/duplicate key/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('zadani rok je 10 s', () => {
    expect(EXPENSE_SAVE_TIMEOUT_MS).toBe(10_000);
  });
});

describe('idempotentnost — isti id na ponovni pokušaj', () => {
  beforeEach(() => __resetSaveIds());

  it('isti potpis vraća isti id dok se ne oslobodi', () => {
    const a = stableSaveId('sig');
    const b = stableSaveId('sig');
    expect(a).toBe(b);
    releaseSaveId('sig');
    expect(stableSaveId('sig')).not.toBe(a);
  });

  it('različiti unosi dobivaju različite id-eve', () => {
    expect(stableSaveId('sig-1')).not.toBe(stableSaveId('sig-2'));
  });

  it('ponovni pokušaj šalje ISTI id — funkcija baze vraća postojeći redak', async () => {
    const stored = new Map<string, { id: string }>();
    const rpc = vi.fn(async (expense: any) => {
      const id = expense.id as string;
      if (!stored.has(id)) stored.set(id, { id });
      return stored.get(id);
    });
    const id = stableSaveId('sig');
    await saveExpenseWithItems({ id }, [], { rpc, sleep: noSleep });
    // Korisnik pritisne "Pokušaj ponovno" — isti potpis, isti id.
    await saveExpenseWithItems({ id: stableSaveId('sig') }, [], { rpc, sleep: noSleep });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(stored.size).toBe(1);
  });
});
