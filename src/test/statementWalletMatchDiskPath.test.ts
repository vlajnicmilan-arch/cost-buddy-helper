/**
 * DISK-PUT MORA PREPOZNAVATI RAČUN ISTOM LOGIKOM KAO MAIL-PUT.
 *
 * Čuvar pada ako netko u ručnom uvozu napiše vlastito podudaranje umjesto
 * `pickStatementSource`, ili makne pitanje o spremanju IBAN-a na novčanik.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const host = readFileSync('src/components/pdf-import/GlobalPDFImportHost.tsx', 'utf8');

describe('ručni uvoz izvoda — pripadnost računa', () => {
  it('koristi ZAJEDNIČKI pickStatementSource', () => {
    expect(host).toContain("from '@/lib/mail/statementSourceMatch'");
    expect(host).toContain('pickStatementSource({');
  });

  it('uzima u obzir pravilo, bank_accounts i ime banke', () => {
    expect(host).toContain('suggestSourceId(');
    expect(host).toContain('suggestSourceFromBankAccounts(');
    expect(host).toContain('bankName');
  });

  it('nudi spremanje identiteta na novčanik bez upisanog računa', () => {
    expect(host).toContain("kind: 'save'");
    expect(host).toContain('account_identifier: ask.statementIdentifier');
  });

  it('zadržava postojeću branu neslaganja identiteta', () => {
    expect(host).toContain('checkAccountIdentity(');
    expect(host).toContain('AccountIdentityMismatchDialog');
  });
});
