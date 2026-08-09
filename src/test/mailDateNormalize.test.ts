/**
 * DATUMI — hrvatski oblik nikad ne smije stići sirov do baze.
 * Živi kvar: "28.02.2026." → [22008] date/time field value out of range.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeDateToIso,
  normalizeExtractionDates,
} from '@/lib/mail/dateNormalize';
import { mergeDeterministic, flattenUblExtraction } from '../../supabase/functions/_shared/mailImport/extractionNormalize.ts';

describe('normalizeDateToIso', () => {
  it('doslovan ulaz s korisnikovog ekrana', () => {
    expect(normalizeDateToIso('28.02.2026.')).toBe('2026-02-28');
  });

  it('hrvatske varijante', () => {
    expect(normalizeDateToIso('28.2.2026')).toBe('2026-02-28');
    expect(normalizeDateToIso('28. 02. 2026.')).toBe('2026-02-28');
    expect(normalizeDateToIso(' 1/3/2026 ')).toBe('2026-03-01');
    expect(normalizeDateToIso('1-3-2026')).toBe('2026-03-01');
  });

  it('ISO ostaje ISO', () => {
    expect(normalizeDateToIso('2026-02-28')).toBe('2026-02-28');
    expect(normalizeDateToIso('2026-02-28T10:00:00Z')).toBe('2026-02-28');
  });

  it('smeće i nepostojeći dan → null (nikad izmišljanje)', () => {
    expect(normalizeDateToIso('')).toBeNull();
    expect(normalizeDateToIso(null)).toBeNull();
    expect(normalizeDateToIso(undefined)).toBeNull();
    expect(normalizeDateToIso('sutra')).toBeNull();
    expect(normalizeDateToIso('32.01.2026')).toBeNull();
    expect(normalizeDateToIso('28.13.2026')).toBeNull();
    expect(normalizeDateToIso('29.02.2027')).toBeNull();
  });
});

describe('normalizeExtractionDates', () => {
  it('normalizira sva datumska polja, ostalo ne dira', () => {
    const out = normalizeExtractionDates({
      issue_date: '28.02.2026.',
      due_date: '2026-03-15',
      supplier_name: 'Telemach',
      total_amount: 12.5,
    });
    expect(out.issue_date).toBe('2026-02-28');
    expect(out.due_date).toBe('2026-03-15');
    expect(out.supplier_name).toBe('Telemach');
    expect(out.total_amount).toBe(12.5);
  });

  it('nevaljan datum postaje null, ne ruši payload', () => {
    expect(normalizeExtractionDates({ issue_date: 'nema' }).issue_date).toBeNull();
  });
});

describe('izvor začepljen — AI dopuna i UBL izlaze u ISO', () => {
  it('mergeDeterministic normalizira AI datume', () => {
    const merged = mergeDeterministic(
      { issue_date: '28.02.2026.', supplier_name: 'Telemach' },
      { due_date: '15.03.2026.' },
    );
    expect(merged.issue_date).toBe('2026-02-28');
    expect(merged.due_date).toBe('2026-03-15');
  });

  it('UBL grana također prolazi kroz prevoditelja', () => {
    const flat = flattenUblExtraction({ issueDate: '28.02.2026.', dueDate: '2026-03-15' });
    expect(flat.issue_date).toBe('2026-02-28');
    expect(flat.due_date).toBe('2026-03-15');
  });
});
