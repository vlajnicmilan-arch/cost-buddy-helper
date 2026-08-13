import { describe, it, expect, vi } from 'vitest';
import {
  classifyFetchFailure,
  runWithTransientRetry,
  RETRY_DELAYS_MS,
} from '@/lib/expenseFetchRetry';

const noSleep = async () => {};

describe('classifyFetchFailure', () => {
  it('prepoznaje mrežni pad', () => {
    const info = classifyFetchFailure(new TypeError('Failed to fetch'));
    expect(info.kind).toBe('network');
    expect(info.retryable).toBe(true);
  });

  it('prepoznaje prekid/timeout', () => {
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(classifyFetchFailure(abort)).toMatchObject({ kind: 'timeout', retryable: true });
    expect(classifyFetchFailure(new Error('Request timed out'))).toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });

  it('5xx je prolazan, 4xx nije', () => {
    expect(classifyFetchFailure({ status: 503, message: 'Service Unavailable' })).toMatchObject({
      kind: 'http',
      retryable: true,
    });
    expect(classifyFetchFailure({ status: 400, message: 'Bad Request' })).toMatchObject({
      kind: 'http',
      retryable: false,
    });
    expect(classifyFetchFailure({ status: 403, message: 'permission denied' })).toMatchObject({
      retryable: false,
    });
  });

  it('401 / jwt ostaje na svom putu (auth, bez prolaznog retryja)', () => {
    expect(classifyFetchFailure({ status: 401, message: 'Unauthorized' })).toMatchObject({
      kind: 'auth',
      retryable: false,
    });
    expect(classifyFetchFailure(new Error('JWT expired'))).toMatchObject({
      kind: 'auth',
      retryable: false,
    });
  });
});

describe('runWithTransientRetry', () => {
  it('mrežni pad → retry → uspjeh (bez bacanja greške)', async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const { result, attempts } = await runWithTransientRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new TypeError('Failed to fetch');
        return ['a', 'b'];
      },
      { sleep: noSleep, onRetry },
    );
    expect(result).toEqual(['a', 'b']);
    expect(attempts).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0].kind).toBe('network');
  });

  it('iscrpljeni pokušaji → baca zadnju grešku', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(runWithTransientRetry(fn, { sleep: noSleep })).rejects.toThrow('Failed to fetch');
    expect(fn).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });

  it('neprolazne greške se ne ponavljaju', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    });
    await expect(runWithTransientRetry(fn, { sleep: noSleep })).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('odgode rastu (1s, 3s)', async () => {
    const delays: number[] = [];
    const fn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      runWithTransientRetry(fn, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toThrow();
    expect(delays).toEqual([1000, 3000]);
  });
});
