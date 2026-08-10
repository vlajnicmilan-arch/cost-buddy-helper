/**
 * REGRESIJA — "na izvodu jasno piše -50,00, a aplikacija me pita je li novac
 * ušao ili izašao". Predznak retka mora biti odgovor, ne pitanje.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTransferDirection,
  statementDirectionFromType,
} from '@/lib/importReview/transferDirection';
import { reclassifyInternalTransfers, type ReclassifiableTransaction } from '@/lib/pdfPostProcess';

describe('resolveTransferDirection', () => {
  it('predznak s izvoda pobjeđuje i ne pita korisnika', () => {
    const r = resolveTransferDirection({ statementDirection: 'out', description: 'Prijenos' });
    expect(r.direction).toBe('out');
    expect(r.source).toBe('amount');
    expect(r.conflict).toBe(false);
  });

  it('predznak pobjeđuje i kad ga opis proturječi (konflikt se samo javlja)', () => {
    const r = resolveTransferDirection({
      statementDirection: 'out',
      description: 'Uplata na račun',
    });
    expect(r.direction).toBe('out');
    expect(r.conflict).toBe(true);
  });

  it('pravilo se koristi tek kad izvod nema predznak', () => {
    const r = resolveTransferDirection({ statementDirection: null, ruleDirection: 'in' });
    expect(r).toMatchObject({ direction: 'in', source: 'rule' });
  });

  it('predznak je jači i od pravila', () => {
    const r = resolveTransferDirection({ statementDirection: 'out', ruleDirection: 'in' });
    expect(r).toMatchObject({ direction: 'out', source: 'amount' });
  });

  it('bez predznaka i pravila pada na opis', () => {
    const r = resolveTransferDirection({ description: 'Isplata na Revolut' });
    expect(r.source === 'description' || r.source === null).toBe(true);
  });

  it('bez ijednog signala vraća null → tek tada se pita', () => {
    const r = resolveTransferDirection({ description: 'XYZ 123' });
    expect(r.direction).toBeNull();
    expect(r.source).toBeNull();
  });
});

describe('statementDirectionFromType', () => {
  it('mapira parserov tip retka', () => {
    expect(statementDirectionFromType('expense')).toBe('out');
    expect(statementDirectionFromType('income')).toBe('in');
    expect(statementDirectionFromType('transfer')).toBeNull();
  });
});

describe('reclassifyInternalTransfers čuva predznak', () => {
  it('odljev reklasificiran u prijenos nosi statement_direction=out', () => {
    const [row] = reclassifyInternalTransfers<ReclassifiableTransaction>([
      { type: 'expense', description: 'Prijenos na Revolut' },
    ]);
    expect(row.type).toBe('transfer');
    expect(row.statement_direction).toBe('out');
  });

  it('priljev reklasificiran u prijenos nosi statement_direction=in', () => {
    const [row] = reclassifyInternalTransfers<ReclassifiableTransaction>([
      { type: 'income', description: 'Prijenos s Revoluta' },
    ]);
    expect(row.type).toBe('transfer');
    expect(row.statement_direction).toBe('in');
  });
});
