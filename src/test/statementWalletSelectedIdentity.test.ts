/**
 * ODABRANI NOVČANIK S PODUDARNIM IBAN-OM NE SMIJE DOBITI PITANJE O PRIPADNOSTI.
 *
 * Provjera ide iz identiteta upisanog NA SAMOM odabranom novčaniku, prije
 * pickStatementSource — deterministički, neovisno o opsegu popisa novčanika.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkAccountIdentity } from '@/lib/importReview/accountIdentityGuard';

const host = readFileSync('src/components/pdf-import/GlobalPDFImportHost.tsx', 'utf8');

const STATEMENT_IBAN = 'HR4224020061101288287';

describe('izravna potvrda iz odabranog novčanika', () => {
  it('(a) isti IBAN → potvrđeno', () => {
    expect(checkAccountIdentity(STATEMENT_IBAN, 'HR42 2402 0061 1012 88287'.replace(/\s/g, '')).status)
      .toBe('match');
  });

  it('(b) različit IBAN → i dalje nesklad', () => {
    expect(checkAccountIdentity(STATEMENT_IBAN, 'HR1723600001101234565').status).toBe('mismatch');
  });

  it('(c) novčanik bez IBAN-a → nepoznato (pita kao danas)', () => {
    expect(checkAccountIdentity(STATEMENT_IBAN, null).status).toBe('unknown');
  });

  it('potvrda se radi PRIJE pickStatementSource i tiho nastavlja', () => {
    const confirm = host.indexOf("status === 'match'");
    const pick = host.indexOf('pickStatementSource({');
    expect(confirm).toBeGreaterThan(-1);
    expect(confirm).toBeLessThan(pick);
    expect(host).toContain("reason: 'selected_wallet_identifier'");
  });

  it('vlastiti izvještaj (Centar) i dalje ide prvi', () => {
    const own = host.indexOf("kind: 'own_report'");
    const confirm = host.indexOf("status === 'match'");
    expect(own).toBeGreaterThan(-1);
    expect(own).toBeLessThan(confirm);
  });

  it('instrumentacija nepotvrđenog bilježi opseg i maskirani identitet', () => {
    expect(host).toContain('sources_considered:');
    expect(host).toContain('any_identifier_match:');
    expect(host).toContain('statement_identifier_masked: accountIdentifier ? maskAccountIdentity(accountIdentifier) : null');
  });
});
