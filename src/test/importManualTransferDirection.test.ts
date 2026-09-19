/**
 * REGRESIJA — ručno označeni prijenos s predznakom se NE pita za smjer.
 *
 * Stvarni kvar (Revolut „aircash.eu, Visa Direct" −50 €): redak nije
 * prepoznat kao prijenos (nema ključne riječi), korisnik ga ručno označi,
 * a UI je nudio gumbe „Novac je ušao / izašao" bez predodabira iako izvod
 * jasno nosi predznak (rashod → 'out').
 *
 * Pravilo iz transferDirection.ts („predznak je odgovor") sada vrijedi i za
 * ručno označene retke: derivedDirection se računa iz row.type.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  reviewRowDerivedDirection,
  statementDirectionFromType,
} from '@/lib/importReview/transferDirection';
import { classifyTransferDescription } from '@/lib/moneyDirection';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/ImportReview.tsx'), 'utf8');

describe('reviewRowDerivedDirection — ručno označeni prijenos', () => {
  it('redak expense bez ključne riječi → smjer out, bez pitanja', () => {
    const desc = 'aircash.eu, Visa Direct';
    expect(classifyTransferDescription(desc).direction).toBeNull(); // nema ključne riječi
    const dir = reviewRowDerivedDirection({
      type: 'expense',
      classificationKind: 'new',
      classificationDirection: null,
      classificationDirectionSource: null,
    });
    expect(dir).toBe('out');
  });

  it('redak income ručno označen kao prijenos → smjer in', () => {
    expect(reviewRowDerivedDirection({ type: 'income', classificationKind: 'new' })).toBe('in');
  });

  it('redak bez predznaka → null (i dalje traži odabir)', () => {
    expect(reviewRowDerivedDirection({ type: 'transfer', classificationKind: 'new' })).toBeNull();
    expect(statementDirectionFromType('nepoznato')).toBeNull();
  });

  it('automatski prepoznat prijenos s predznaka — nepromijenjeno', () => {
    expect(reviewRowDerivedDirection({
      type: 'transfer',
      classificationKind: 'transfer',
      classificationDirection: 'out',
      classificationDirectionSource: 'amount',
    })).toBe('out');
  });

  it('prepoznat prijenos bez predznaka (opis/pravilo) → pada na opis, UI pita', () => {
    expect(reviewRowDerivedDirection({
      type: 'transfer',
      classificationKind: 'transfer',
      classificationDirection: 'in',
      classificationDirectionSource: 'description',
    })).toBeNull();
  });
});

describe('ImportReview — izvedeni smjer i za ručne prijenose', () => {
  it('derivedDirection dolazi iz reviewRowDerivedDirection (uključuje row.type)', () => {
    expect(SRC).toContain('reviewRowDerivedDirection({');
    expect(SRC).toMatch(/const derivedDirection: MoneyDirection \| null = reviewRowDerivedDirection\(\{[\s\S]*?type: row\.type,/);
  });

  it('početna odluka pri ručnom označavanju nosi predznak s izvoda', () => {
    expect(SRC).toContain('statementDirectionFromType(row.type) ?? classifyTransferDescription(row.description).direction');
  });

  it('gumbi se nude samo kad nema izvedenog smjera; napomena koristi fromStatement ključeve', () => {
    expect(SRC).toMatch(/\{derivedDirection \? \(/);
    expect(SRC).toContain("t(`importReview.transferDirection.fromStatement.${derivedDirection}`)");
  });
});
