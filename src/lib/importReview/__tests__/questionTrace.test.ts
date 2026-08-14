import { describe, it, expect, vi } from 'vitest';
import { classifyImport } from '@/lib/importClassifier';
import { emitQuestionTraces, TRACE_EVENT } from '../questionTrace';

const SRC = 'custom:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const day = (s: string) => new Date(`${s}T12:00:00.000Z`);
const BUILD = 'abc1234def5678';

describe('emitQuestionTraces', () => {
  it('pitanje (merchant_mismatch) → jedan event s točnim poljima', () => {
    const imported = [
      { index: 0, paymentSource: SRC, type: 'expense', amount: 24.8, date: day('2026-02-27'), merchantName: 'CHEVAP GRILL' },
    ];
    const manualCandidates = [
      { id: 'm1', paymentSource: SRC, type: 'expense', amount: 24.8, date: day('2026-02-28'), merchantName: 'Bipa' },
    ];
    const classified = classifyImport({ imported, manualCandidates });
    expect(classified.questions).toHaveLength(1);

    const log = vi.fn();
    emitQuestionTraces({ build: BUILD, questions: classified.questions, imported, manualCandidates }, log);

    expect(log).toHaveBeenCalledTimes(1);
    const [event, details] = log.mock.calls[0];
    expect(event).toBe(TRACE_EVENT);
    expect(details).toEqual({
      build: BUILD,
      reason: 'merchant_mismatch',
      bank_derived: 'chevap grill',
      manual_derived: 'bipa',
      raw_merchant_present: true,
      candidates_count: 1,
    });
  });

  it('no_merchant → raw_merchant_present false', () => {
    const imported = [
      { index: 0, paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-06-10'), merchantName: null },
    ];
    const manualCandidates = [
      { id: 'm1', paymentSource: SRC, type: 'expense', amount: 7, date: day('2026-06-10'), merchantName: 'Kafic' },
    ];
    const classified = classifyImport({ imported, manualCandidates });
    const log = vi.fn();
    emitQuestionTraces({ build: BUILD, questions: classified.questions, imported, manualCandidates }, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][1]).toMatchObject({
      reason: 'no_merchant',
      raw_merchant_present: false,
      bank_derived: '',
      manual_derived: 'kafic',
    });
  });

  it('autoMerge → nijedan event', () => {
    const imported = [
      { index: 0, paymentSource: SRC, type: 'expense', amount: 11, date: day('2026-06-10'), merchantName: 'ALE-HOP' },
    ];
    const manualCandidates = [
      { id: 'm1', paymentSource: SRC, type: 'expense', amount: 11, date: day('2026-06-10'), merchantName: 'Ale Hop' },
    ];
    const classified = classifyImport({ imported, manualCandidates });
    expect(classified.autoMerge).toHaveLength(1);
    const log = vi.fn();
    emitQuestionTraces({ build: BUILD, questions: classified.questions, imported, manualCandidates }, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('ime se reže na 40 znakova', () => {
    const long = 'A'.repeat(80);
    const imported = [
      { index: 0, paymentSource: SRC, type: 'expense', amount: 5, date: day('2026-06-10'), merchantName: long },
    ];
    const manualCandidates = [
      { id: 'm1', paymentSource: SRC, type: 'expense', amount: 5, date: day('2026-06-10'), merchantName: 'Bipa' },
    ];
    const classified = classifyImport({ imported, manualCandidates });
    const log = vi.fn();
    emitQuestionTraces({ build: BUILD, questions: classified.questions, imported, manualCandidates }, log);
    expect(log.mock.calls[0][1].bank_derived).toHaveLength(40);
  });
});
