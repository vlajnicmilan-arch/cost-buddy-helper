/**
 * DISK-PUT MORA NOSITI SALDO ISTIM KANALOM KAO MAIL-PUT.
 *
 * Ovaj čuvar pada ako netko izvadi deterministički čitač iz
 * `parse-pdf-statement`, prestane vraćati `closing_balance` klijentu ili
 * uvede paralelni mehanizam mimo `statementClosingBalance`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const edge = readFileSync('supabase/functions/parse-pdf-statement/index.ts', 'utf8');
const parser = readFileSync('src/hooks/usePDFParser.ts', 'utf8');
const context = readFileSync('src/contexts/PdfImportContext.tsx', 'utf8');
const host = readFileSync('src/components/pdf-import/GlobalPDFImportHost.tsx', 'utf8');

describe('parse-pdf-statement', () => {
  it('koristi ZAJEDNIČKI čitač, ne vlastiti parser', () => {
    expect(edge).toContain('extractStatementBalance');
    expect(edge).toContain('_shared/mailImport/statementSignals.ts');
  });

  it('čita nad cijelim tekstualnim slojem, ne po blokovima', () => {
    expect(edge).toContain('extractStatementBalance(pdfPlainText)');
  });

  it('vraća saldo, valutu i kraj razdoblja', () => {
    expect(edge).toContain('closing_balance: statementBalance.closingBalance');
    expect(edge).toContain('closing_currency: statementBalance.currency');
    expect(edge).toContain('statement_period_to: statementBalance.periodTo');
  });
});

describe('klijentski kanal', () => {
  it('rezultat čitanja nosi closing_balance', () => {
    expect(parser).toContain('closing_balance');
    expect(parser).toContain('statement_period_to');
  });

  it('mig s mail-puta ima prednost nad diskom', () => {
    expect(context).toContain('if (current && typeof current.closingBalance === \'number\') return current;');
  });

  it('payload ide ISTIM poljem (statementClosingBalance)', () => {
    expect(host).toContain('statementClosingBalance:');
    expect(host).toContain('pdfImport.result.closing_balance');
  });
});
