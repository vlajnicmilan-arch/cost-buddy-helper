import { describe, it, expect } from 'vitest';
import { classifyImport } from '@/lib/importClassifier';

const SRC = 'custom:8f922feb-6b36-4d89-be95-3bab95766532';
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Ručni kandidati — točno kako stoje u bazi (merchant_name NULL osim imena).
const manualCandidates = [
  ['e0a56efa', '2026-02-02', 0.21, 'Naknada', null],
  ['3a0a5658', '2026-02-03', 0.21, 'Naknada', null],
  ['4889d9dd', '2026-02-09', 0.21, 'Naknada za plaćanje', null],
  ['14b73ed8', '2026-02-09', 0.21, 'Naknada', null],
  ['5c9f0677', '2026-02-09', 1.35, 'Naknada za eksterni priljev', null],
  ['3845dcb5', '2026-02-09', 8.00, 'Naknada za paket', null],
  ['24595f72', '2026-02-10', 0.21, 'Naknada', null],
  ['b3eec9d8', '2026-02-10', 0.21, 'Naknada za plaćanje', null],
  ['a1acba4a', '2026-02-10', 10.00, 'rodjendan Ana Milanovic SANJA BALAKOVIĆ STANIĆ', 'Ana Milanovic SANJA BALAKOVIĆ STANIĆ'],
  ['8e7e923f', '2026-02-10', 10.00, 'Plaćanje Kristina Cerina, rodjendan Priska', 'Kristina Cerina'],
  ['84c78cfc', '2026-02-12', 0.21, 'Naknada', null],
  ['089740e3', '2026-02-16', 0.21, 'Naknada', null],
  ['623563a8', '2026-02-23', 0.50, 'Naknada za SEPA izravno terećenje', null],
  ['234ba0f4', '2026-02-25', 0.21, 'Naknada', null],
].map(([id, date, amount, description, merchantName]) => ({
  id: id as string, paymentSource: SRC, type: 'expense', amount: amount as number,
  date: d(date as string), description: description as string, merchantName: merchantName as string | null,
}));

// Uvezeni redci — merchantName = "OTP banka" na SVAKOM retku (kako dolazi danas).
const imported = manualCandidates.map((c, index) => ({
  index,
  paymentSource: SRC,
  type: 'expense',
  amount: c.amount,
  date: c.date,
  merchantName: 'OTP banka',
  description: c.id === 'a1acba4a' ? 'Plaćanje Ana Milanovic' : c.id === '8e7e923f' ? 'Plaćanje Kristina Cerina' : c.description,
}));

describe('MJERENJE — stvarni OTP skup', () => {
  it('ispis', () => {
    const out = classifyImport({ imported, manualCandidates, statementBankName: 'OTP banka' });
    const ids = out.autoMerge.map(p => p.manualId);
    console.log('PITANJA:', out.questions.length, JSON.stringify(out.questions));
    console.log('AUTOMERGE:', out.autoMerge.length, 'jedinstvenih kandidata:', new Set(ids).size);
    console.log('NOVI:', out.newRows.length, out.newRows);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
