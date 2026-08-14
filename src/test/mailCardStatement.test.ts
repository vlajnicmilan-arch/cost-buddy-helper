/**
 * ČUVAR — CHARGE-KARTIČNI IZVOD PROLAZI LIJEVAK + PRAVILO TIŠINE.
 *
 * Kvar (kolovoz 2026): mjesečni izvod charge kartice („Obavijest o učinjenim
 * troškovima charge karticama") nema nijedan klasični sidreni signal izvoda,
 * pa je završio kao `nije_za_nas` / `niska` — bez obavijesti, tiho.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyAsStatement,
  cardStatementSignals,
  carriesFinancialSubstance,
} from '@/lib/mail/statementSignals';
import {
  classifyDocument,
  CARD_STATEMENT_DOC_TYPE,
} from '../../supabase/functions/_shared/mailImport/classify.ts';
import { OTP_CHARGE_CARD_STATEMENT } from './fixtures/otpChargeCardStatement';

/** Promidžbena kartična poruka: ista rječnik, NULA redaka prometa. */
const PROMO_KARTICA = `OTP banka
Obavijest o učinjenim troškovima charge karticama više ne stiže poštom!
Odobreni limit provjerite u mobilnom bankarstvu.
Datum terećenja vidljiv je u aplikaciji.
Saznajte više na www.otpbanka.hr`;

const parseUbl = () => ({});

describe('kartični izvod — pravi ulaz iz baze', () => {
  it('doslovni tekst privitka 3b6f8129 → izvod (kartični)', () => {
    const verdict = classifyAsStatement(OTP_CHARGE_CARD_STATEMENT);
    expect(verdict.isStatement).toBe(true);
    expect(verdict.isCardStatement).toBe(true);
    expect(verdict.signals).toContain('karticni_retci');
    expect(verdict.signals).toContain('datum_terecenja');
    expect(verdict.signals).toContain('odobreni_limit');
  });

  it('lijevak: klasifikacija = izvod, kartični doc_type, bez AI poziva', async () => {
    const res = await classifyDocument(
      { sniffed: 'pdf', pdfText: OTP_CHARGE_CARD_STATEMENT },
      { parseUbl },
    );
    expect(res.classification).toBe('izvod');
    expect(res.docType).toBe(CARD_STATEMENT_DOC_TYPE);
    expect(res.route).toBe('izvod');
    expect(res.aiCalls).toBe(0);
    // Status u workeru: sve osim nije_za_nas/nepoznato ide na pregled.
    expect(['nije_za_nas', 'nepoznato']).not.toContain(res.classification);
  });

  it('promidžbena kartična poruka bez tablice ostaje van lijevka', () => {
    expect(cardStatementSignals(PROMO_KARTICA.split('\n'))).toEqual([]);
    const verdict = classifyAsStatement(PROMO_KARTICA);
    expect(verdict.isStatement).toBe(false);
    expect(verdict.isCardStatement).toBe(false);
  });
});

describe('pravilo tišine — niska sigurnost nikad ne šuti', () => {
  const SUBSTANCE = `Neki dokument
IBAN: HR1723600001101234565
Iznos 1.093,53 EUR
Stavka 44,57 EUR
Stavka 26,00 EUR`;

  it('IBAN + iznosi = financijska supstanca', () => {
    expect(carriesFinancialSubstance(SUBSTANCE)).toBe(true);
    expect(carriesFinancialSubstance('Newsletter bez brojeva')).toBe(false);
  });

  it('AI „nije_za_nas" s niskom sigurnošću → ljudski red (mozda_izvod)', async () => {
    const res = await classifyDocument(
      { sniffed: 'pdf', pdfText: SUBSTANCE },
      {
        parseUbl,
        analyzeWithAi: async () => ({
          classification: 'nije_za_nas' as const,
          extraction: null,
          confidence: 'niska' as const,
        }),
      },
    );
    expect(res.classification).toBe('nepoznato');
    expect(res.needsHumanChoice).toBe(true);
    expect(res.warnings).toContain('mozda_izvod');
  });

  it('visoka sigurnost i dalje smije tiho odbaciti', async () => {
    const res = await classifyDocument(
      { sniffed: 'pdf', pdfText: SUBSTANCE },
      {
        parseUbl,
        analyzeWithAi: async () => ({
          classification: 'nije_za_nas' as const,
          extraction: null,
          confidence: 'visoka' as const,
        }),
      },
    );
    expect(res.classification).toBe('nije_za_nas');
    expect(res.needsHumanChoice).toBeUndefined();
  });
});
