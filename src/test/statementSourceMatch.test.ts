import { describe, it, expect } from 'vitest';
import {
  matchSourceByAccountIdentifier,
  matchSourceByBankName,
  normalizeInstitutionName,
  pickStatementSource,
} from '@/lib/mail/statementSourceMatch';

const sources = [
  { id: 'cash', name: 'Gotovina' },
  { id: 'rev', name: 'Revolut' },
  { id: 'erste', name: 'Erste račun' },
];

describe('normalizeInstitutionName', () => {
  it('strips diacritics, punctuation and generic words', () => {
    expect(normalizeInstitutionName('Erste&Steiermärkische Bank d.d.')).toBe('erstesteiermarkische');
    expect(normalizeInstitutionName('Revolut Bank UAB')).toBe('revolut');
  });

  it('keeps a purely generic name instead of collapsing to empty', () => {
    expect(normalizeInstitutionName('Banka')).toBe('banka');
  });
});

describe('matchSourceByBankName', () => {
  it('matches "Revolut Bank UAB" to wallet "Revolut"', () => {
    expect(matchSourceByBankName('Revolut Bank UAB', sources)?.id).toBe('rev');
  });

  it('matches in the other direction too', () => {
    expect(matchSourceByBankName('Erste', sources)?.id).toBe('erste');
  });

  it('returns null for unknown or too-short bank names', () => {
    expect(matchSourceByBankName('Wise', sources)).toBeNull();
    expect(matchSourceByBankName('AB', sources)).toBeNull();
    expect(matchSourceByBankName(null, sources)).toBeNull();
  });
});

describe('pickStatementSource', () => {
  it('prefers the remembered rule over everything else', () => {
    expect(
      pickStatementSource({
        ruleSourceId: 'cash',
        bankAccountSourceId: 'erste',
        bankName: 'Revolut Bank UAB',
        sources,
      }),
    ).toEqual({ sourceId: 'cash', reason: 'rule' });
  });

  it('falls back to the bank account mapping', () => {
    expect(
      pickStatementSource({
        bankAccountSourceId: 'erste',
        bankName: 'Revolut Bank UAB',
        sources,
      }),
    ).toEqual({ sourceId: 'erste', reason: 'bank_account' });
  });

  it('falls back to the bank name match', () => {
    expect(pickStatementSource({ bankName: 'Revolut Bank UAB', sources })).toEqual({
      sourceId: 'rev',
      reason: 'bank_name',
    });
  });

  it('ignores ids that are not in the available sources', () => {
    expect(
      pickStatementSource({ ruleSourceId: 'gone', bankName: 'Revolut Bank UAB', sources }),
    ).toEqual({ sourceId: 'rev', reason: 'bank_name' });
  });

  it('returns null when nothing matches', () => {
    expect(pickStatementSource({ bankName: 'Wise Europe SA', sources })).toBeNull();
  });
});

describe('matchSourceByAccountIdentifier', () => {
  const withIban = [
    { id: 'cash', name: 'Gotovina' },
    { id: 'erste', name: 'Erste račun', account_identifier: 'HR1723600001101234565' },
  ];

  it('matches the wallet whose stored identifier equals the statement account', () => {
    expect(
      matchSourceByAccountIdentifier('HR17 2360 0001 1012 34565', withIban)?.id,
    ).toBe('erste');
  });

  it('ignores empty, short or unknown identifiers', () => {
    expect(matchSourceByAccountIdentifier('12345', withIban)).toBeNull();
    expect(matchSourceByAccountIdentifier(null, withIban)).toBeNull();
    expect(matchSourceByAccountIdentifier('HR9999999999999999999', withIban)).toBeNull();
  });

  it('is preferred over bank name but loses to a remembered rule', () => {
    const all = [...withIban, { id: 'rev', name: 'Revolut' }];
    expect(
      pickStatementSource({
        accountIdentifier: 'HR1723600001101234565',
        bankName: 'Revolut Bank UAB',
        sources: all,
      }),
    ).toEqual({ sourceId: 'erste', reason: 'wallet_identifier' });
    expect(
      pickStatementSource({
        ruleSourceId: 'rev',
        accountIdentifier: 'HR1723600001101234565',
        sources: all,
      }),
    ).toEqual({ sourceId: 'rev', reason: 'rule' });
  });
});
