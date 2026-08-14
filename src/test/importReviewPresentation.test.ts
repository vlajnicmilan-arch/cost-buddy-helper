import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitRowDescription, isTechnicalToken } from '@/lib/importReview/describeRow';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/ImportReview.tsx'), 'utf8');

/**
 * ČUVAR PREZENTACIJE EKRANA UVOZA (/import-review).
 *
 * 1. Tehnički otpad (maskirana kartica, UUID, duge reference) NIKAD se ne
 *    briše — samo seli u prigušeni sekundarni redak.
 * 2. Crvena validacija je TIHA dok korisnik ne pokuša nastaviti ili ne dira
 *    polje. Gate obaveznih polja ostaje u `summarize()` — nepromijenjen.
 */
describe('splitRowDescription — ljudski vs tehnički dio', () => {
  it('odvaja maskiranu karticu i UUID od imena trgovca', () => {
    const parts = splitRowDescription(
      '462765XXXXXX7262, AIRCASH.EU ZAGREB, d7cb0d49-9eec-4daa-ab63-6dad78ae4e9d',
    );
    expect(parts.primary).toBe('AIRCASH.EU ZAGREB');
    expect(parts.technical).toEqual([
      '462765XXXXXX7262',
      'd7cb0d49-9eec-4daa-ab63-6dad78ae4e9d',
    ]);
  });

  it('ne gubi nijedan token', () => {
    const raw = 'HR1234567890123456789, PLAĆANJE RAČUNA, 123456789012';
    const { primary, technical } = splitRowDescription(raw);
    const all = [primary, ...technical].join('|');
    for (const token of raw.split(',').map(s => s.trim())) {
      expect(all).toContain(token);
    }
  });

  it('kad je sve tehničko, prvi token postaje naslov', () => {
    const parts = splitRowDescription('462765XXXXXX7262, 123456789012');
    expect(parts.primary).toBe('462765XXXXXX7262');
    expect(parts.technical).toEqual(['123456789012']);
  });

  it('prazan opis daje prazan rezultat', () => {
    expect(splitRowDescription(null)).toEqual({ primary: '', technical: [] });
    expect(splitRowDescription('   ')).toEqual({ primary: '', technical: [] });
  });

  it('obična riječ nije tehnički token', () => {
    expect(isTechnicalToken('KONZUM ZAGREB')).toBe(false);
    expect(isTechnicalToken('d7cb0d49-9eec-4daa-ab63-6dad78ae4e9d')).toBe(true);
  });
});

describe('ImportReview — tiha validacija', () => {
  it('crvena upozorenja ovise o pokušaju potvrde ili dirnutom polju', () => {
    expect(SRC).toMatch(/const showValidation = attemptedConfirm \|\| touchedRows\[row\.index\] === true;/);
    expect(SRC).toMatch(/const missingTarget = showControls && !currentTargetId && showValidation;/);
    expect(SRC).toMatch(/currentDirection !== 'out' && showValidation/);
  });

  it('gate obaveznih polja ostaje — potvrda bez canConfirm ne izvršava uvoz', () => {
    expect(SRC).toMatch(/if \(!summary\.canConfirm\) \{[\s\S]{0,600}setAttemptedConfirm\(true\);[\s\S]{0,600}return;/);
  });

  it('potvrda govori što koči — poruka s brojkama i skok na prvi sporni redak', () => {
    expect(SRC).toContain('setBlockerMessages(buildBlockerMessages(summary, t));');
    expect(SRC).toContain('firstBlockingRowIndex(payload, decisions)');
    expect(SRC).toContain('data-testid="confirm-blockers"');
  });

  it('vidljiv izlaz "izvan mojih računa" koristi postojeći enabled:false put', () => {
    expect(SRC).toContain("t('importReview.outsideAccounts.button')");
    expect(SRC).toMatch(/data-testid=\{`transfer-outside-\$\{row\.index\}`\}/);
    expect(SRC).toMatch(/enabled: false, rememberRule: false/);
  });


  it('polja se označavaju dirnutima pri odabiru smjera i novčanika', () => {
    expect(SRC.match(/markTouched\(row\.index\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('opisi idu kroz RowDescription (bez sirovog row.description u karticama)', () => {
    expect(SRC).toContain('<RowDescription description={row.description} />');
    expect(SRC).not.toMatch(/truncate">\{row\.description\}<\/p>/);
  });
});
