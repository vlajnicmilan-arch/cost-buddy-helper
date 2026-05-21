import { describe, it, expect } from 'vitest';
import { getInitialBankMatchStatus } from './bankMatchStatus';

const linkedId = '11111111-1111-1111-1111-111111111111';
const unlinkedId = '22222222-2222-2222-2222-222222222222';
const linkedSet = new Set([linkedId]);
const emptySet = new Set<string>();

describe('getInitialBankMatchStatus', () => {
  describe('CSV/PDF uvoz (izvod)', () => {
    it('CSV uvoz uvijek vraća bank_only — i kad je izvor spojen na banku', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'csv',
          paymentSource: `custom:${linkedId}`,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('bank_only');
    });

    it('PDF uvoz uvijek vraća bank_only — i za cash izvor', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'pdf',
          paymentSource: 'cash',
          bankLinkedSourceIds: emptySet,
        }),
      ).toBe('bank_only');
    });
  });

  describe('Recurring auto-generate', () => {
    it('uvijek manual, neovisno o payment_source', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'recurring',
          paymentSource: `custom:${linkedId}`,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });
  });

  describe('Ručni unos (manual)', () => {
    it('gotovina → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: 'cash',
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });

    it('custom izvor BEZ bank konekcije → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: `custom:${unlinkedId}`,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });

    it('custom izvor S bank konekcijom → pending_bank', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: `custom:${linkedId}`,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('pending_bank');
    });

    it('prazan/null payment_source → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: null,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: '',
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });

    it('legacy ne-custom string (npr. "other") → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: 'other',
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });

    it('malformiran custom: bez UUID → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: 'custom:',
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });
  });

  describe('OCR (slikani račun) — ista logika kao manual', () => {
    it('račun + custom izvor bez banke → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'ocr',
          paymentSource: `custom:${unlinkedId}`,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });

    it('račun + custom izvor S bankom → pending_bank (čeka bank potvrdu)', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'ocr',
          paymentSource: `custom:${linkedId}`,
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('pending_bank');
    });

    it('račun + gotovina → manual', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'ocr',
          paymentSource: 'cash',
          bankLinkedSourceIds: linkedSet,
        }),
      ).toBe('manual');
    });
  });

  describe('Prazan bankLinkedSourceIds (nitko nije spojio banku)', () => {
    it('manual + custom izvor → manual (nema spojene banke)', () => {
      expect(
        getInitialBankMatchStatus({
          source: 'manual',
          paymentSource: `custom:${linkedId}`,
          bankLinkedSourceIds: emptySet,
        }),
      ).toBe('manual');
    });
  });
});
