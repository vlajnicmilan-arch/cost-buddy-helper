import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifyAsStatement,
  statementSignals,
  STATEMENT_SIGNAL_THRESHOLD,
} from '@/lib/mail/statementSignals';

/**
 * VETO: bankovni izvod NIKAD ne smije tiho postati `racun`.
 * Poznat pošiljatelj (banka) je najopasniji slučaj — heuristika bi ga inače
 * tvrdo klasificirala kao račun i knjižila saldo kao iznos.
 */

const ZABA_IZVOD = `ZAGREBAČKA BANKA d.d.
Izvod br. 152/2026
Za razdoblje 01.08.2026. - 31.08.2026.
IBAN: HR1210010051863000160
Prethodno stanje 1.230,00
Promet duguje 450,00 Potražuje 120,00
Novo stanje 900,00`;

const ERSTE_IZVOD = `Erste&Steiermärkische Bank d.d.
IZVOD BROJ 8/2026 za dan 12.08.2026.
Stanje računa na dan 12.08.2026.
HR23 2402 0061 1000 0000 0
Promet duguje: 12,00 potražuje: 0,00
Novo stanje: 3.011,45`;

const RACUN = `HRVATSKI TELEKOM d.d.
Račun broj 123-456-1
Datum izdavanja: 01.08.2026.
Datum dospijeća: 15.08.2026.
Ukupno za platiti: 34,90 EUR
IBAN za uplatu: HR1723600001101234565`;

describe('veto klasifikacije — bankovni izvod', () => {
  it('Zaba izvod: ≥2 sidrena signala → izvod', () => {
    const verdict = classifyAsStatement(ZABA_IZVOD);
    expect(verdict.signals.length).toBeGreaterThanOrEqual(STATEMENT_SIGNAL_THRESHOLD);
    expect(verdict.isStatement).toBe(true);
  });

  it('Erste izvod: prepoznat i s razmaknutim IBAN-om', () => {
    const verdict = classifyAsStatement(ERSTE_IZVOD);
    expect(verdict.isStatement).toBe(true);
    expect(verdict.extraction.account_iban).toBe('HR2324020061100000000');
  });

  it('izvod nosi SAMO izvod-polja (banka, IBAN, broj, razdoblje, stanje)', () => {
    const { extraction } = classifyAsStatement(ZABA_IZVOD);
    expect(extraction.bank_name).toBe('Zagrebačka banka');
    expect(extraction.account_iban).toBe('HR1210010051863000160');
    expect(extraction.statement_number).toBe('152/2026');
    expect(extraction.period_from).toBe('2026-08-01');
    expect(extraction.period_to).toBe('2026-08-31');
    expect(extraction.closing_balance).toBe(900);
    expect(Object.keys(extraction)).not.toContain('total_amount');
  });

  it('običan račun nije izvod i ne traži čovjekov izbor (IBAN sam nije sumnja)', () => {
    const verdict = classifyAsStatement(RACUN);
    expect(verdict.signals).toEqual(['iban_zaglavlje']);
    expect(verdict.isStatement).toBe(false);
    expect(verdict.needsHumanChoice).toBe(false);
  });

  it('jedan sidreni signal = sumnja, nikad tiho racun', () => {
    const verdict = classifyAsStatement('Neki dokument\nNovo stanje 10,00');
    expect(verdict.signals).toEqual(['stanje']);
    expect(verdict.isStatement).toBe(false);
    expect(verdict.needsHumanChoice).toBe(true);
  });

  it('prazan tekst ne izmišlja signale', () => {
    expect(statementSignals('')).toEqual([]);
    expect(classifyAsStatement(null).isStatement).toBe(false);
  });
});

describe('veto je ugrađen u lanac klasifikacije', () => {
  const classifySrc = readFileSync(
    resolve(process.cwd(), 'supabase/functions/_shared/mailImport/classify.ts'),
    'utf8',
  );

  it('veto stoji PRIJE determinističkog ulova iz teksta', () => {
    const veto = classifySrc.indexOf('classifyAsStatement(');
    const heuristika = classifySrc.indexOf('// ---- 3. Deterministički ulov iz teksta');
    expect(veto).toBeGreaterThan(-1);
    expect(veto).toBeLessThan(heuristika);
  });

  it('izvod ne troši AI dopunu', () => {
    expect(classifySrc).toContain("if (classification === 'izvod') return false;");
  });

  it('worker prosljeđuje klasifikaciju u needsAiEnrichment', () => {
    const worker = readFileSync(
      resolve(process.cwd(), 'supabase/functions/mail-process/index.ts'),
      'utf8',
    );
    expect(worker).toContain(
      'needsAiEnrichment(result.extraction, hasExtractableText(input), result.classification)',
    );
  });
});

describe('tri kvara s pravog Erste izvoda', () => {
  const ERSTE = [
    'Erste&Steiermärkische Bank d.d.',
    'Izvod br. 152',
    'IBAN: HR7324020061101086163',
    'Broj računa: 1101086163',
    'Prethodno stanje 461,94',
    'Promet duguje 300,00 potražuje 82,91',
    'Konačno stanje: 244,85',
  ].join('\n');

  it('IBAN se reže na HR + 19 znamenki (bez „BROJRA" iz sljedećeg retka)', () => {
    const v = classifyAsStatement(ERSTE);
    expect(v.extraction.account_iban).toBe('HR7324020061101086163');
  });

  it('„Konačno stanje: 244,85" → 244.85', () => {
    expect(classifyAsStatement(ERSTE).extraction.closing_balance).toBe(244.85);
  });

  it('sanitizeIban odbacuje prljav ključ pravila', async () => {
    const { sanitizeIban } = await import('@/lib/mailImport/iban');
    expect(sanitizeIban('HR7324020061101086163BROJRA')).toBe('HR7324020061101086163');
    expect(sanitizeIban('HR12')).toBe('');
    expect(sanitizeIban('smeće')).toBe('');
  });
});

describe('izvor-picker sluša scope stavke', () => {
  it('kartica traži izvore profila na koji stavka glasi', async () => {
    const { readFileSync } = await import('node:fs');
    const card = readFileSync('src/components/mail/StatementReviewCard.tsx', 'utf8');
    expect(card).toContain("item.scope_type === 'business_profile'");
    expect(card).toContain('businessProfileIdOverride: scopeProfileId');
    const hook = readFileSync('src/hooks/useCustomPaymentSources.ts', 'utf8');
    expect(hook).toContain('businessProfileIdOverride');
    expect(hook).toContain('readProfileId');
  });
});
