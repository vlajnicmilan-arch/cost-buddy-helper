import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkAccountIdentity,
  maskAccountIdentity,
} from '@/lib/importReview/accountIdentityGuard';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Živi slučaj 23.8.: tuđi Revolut izvod prema korisnikovom novčaniku. */
const STATEMENT_IBAN = 'LT433250072163608687';
const WALLET_IBAN = 'LT183250041594525319';

describe('brana identiteta računa', () => {
  it('različiti IBAN-i → uvoz staje (mismatch)', () => {
    const check = checkAccountIdentity(STATEMENT_IBAN, WALLET_IBAN);
    expect(check.status).toBe('mismatch');
    expect(check.statement).toBe(STATEMENT_IBAN);
    expect(check.wallet).toBe(WALLET_IBAN);
  });

  it('isti IBAN (razmaci, mala slova) → nikakvo pitanje', () => {
    expect(checkAccountIdentity('lt18 3250 0415 9452 5319', WALLET_IBAN).status).toBe('match');
  });

  it('novčanik bez identifikatora → nikakvo pitanje', () => {
    expect(checkAccountIdentity(STATEMENT_IBAN, null).status).toBe('unknown');
    expect(checkAccountIdentity(STATEMENT_IBAN, '   ').status).toBe('unknown');
  });

  it('izvod bez identifikatora → nikakvo pitanje', () => {
    expect(checkAccountIdentity(null, WALLET_IBAN).status).toBe('unknown');
  });

  it('broj računa (bez IBAN-a) uspoređuje se normalizirano', () => {
    expect(checkAccountIdentity('1001-0051 234', '10010051234').status).toBe('match');
    expect(checkAccountIdentity('1001-0051 234', '10010051999').status).toBe('mismatch');
  });

  it('prikaz nosi oba kraja identiteta', () => {
    expect(maskAccountIdentity(STATEMENT_IBAN)).toBe('LT4332…8687');
    expect(maskAccountIdentity(WALLET_IBAN)).toBe('LT1832…5319');
  });
});

describe('oba uvozna puta pitaju prije izvršenja', () => {
  it('disk-put provjerava identitet prije pripreme redaka', () => {
    const host = read('src/components/pdf-import/GlobalPDFImportHost.tsx');
    const check = host.indexOf('checkAccountIdentity(');
    const rows = host.indexOf('const transactions = toParsedTransactions();');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(rows);
    expect(host).toContain('identityConfirmedRef.current = true');
  });

  it('mail-put provjerava identitet prije startImport', () => {
    const card = read('src/components/mail/StatementReviewCard.tsx');
    const check = card.indexOf('checkAccountIdentity(');
    const start = card.indexOf('await startImport({');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(start);
  });

  it('svjesna potvrda se ne pamti kao pravilo', () => {
    const guard = read('src/lib/importReview/accountIdentityGuard.ts');
    expect(guard).not.toContain('rememberRule');
    const dialog = read('src/components/import/AccountIdentityMismatchDialog.tsx');
    expect(dialog).not.toContain('rememberRule');
  });
});
