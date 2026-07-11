/**
 * TransactionDetailDialog — auto-close nakon uspješne Krug reassignment akcije.
 *
 * Zaključava uski scope:
 *  - `KrugTransactionPanel` ima `onReassignSuccess` callback prop.
 *  - Callback je vezan ISKLJUČIVO uz setPrivacy / A3 retract / A7 govern.
 *    Voting akti (A1/A2/A4/A5) ga NE trigeriraju.
 *  - Trigger je gated preko success outcome set-ova (ne "svaki klik").
 *  - `TransactionDetailDialog` prosljeđuje `() => onOpenChange(false)`,
 *    ali samo kad NIJE `readOnlyKrug` (u kojem slučaju panel se ni ne renderira).
 *
 * Source-level guard, bez DOM rendera — svrha je zaključati semantiku.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('KrugTransactionPanel — onReassignSuccess wiring', () => {
  const src = read('src/components/krug/KrugTransactionPanel.tsx');

  it('deklarira opcionalni onReassignSuccess prop', () => {
    expect(src).toMatch(/onReassignSuccess\?:\s*\(\)\s*=>\s*void/);
    expect(src).toMatch(
      /export function KrugTransactionPanel\(\{\s*expenseId,\s*expenseAuthorId,\s*onReassignSuccess\s*\}/,
    );
  });

  it('setPrivacy.mutate: callback samo na success outcome (SET_PRIVACY_OK)', () => {
    expect(src).toMatch(
      /setPrivacy\.mutate\([\s\S]{0,180}onSuccess:\s*\(res\)\s*=>\s*\{[\s\S]{0,120}SET_PRIVACY_OK\.has\(res\.outcome\)[\s\S]{0,60}onReassignSuccess\?\.\(\)/,
    );
  });

  it('retract.mutate (A3): callback samo na RETRACT_OK', () => {
    expect(src).toMatch(
      /retract\.mutate\([\s\S]{0,180}onSuccess:\s*\(res\)\s*=>\s*\{[\s\S]{0,120}RETRACT_OK\.has\(res\.outcome\)[\s\S]{0,60}onReassignSuccess\?\.\(\)/,
    );
  });

  it('govern.mutate (A7): callback samo na GOVERN_OK', () => {
    expect(src).toMatch(
      /govern\.mutate\([\s\S]{0,180}onSuccess:\s*\(res\)\s*=>\s*\{[\s\S]{0,120}GOVERN_OK\.has\(res\.outcome\)[\s\S]{0,60}onReassignSuccess\?\.\(\)/,
    );
  });

  it('voting akti (A1/A2/A4/A5) NE trigeriraju onReassignSuccess', () => {
    // applyAct + withdraw se pozivaju bez onSuccess opcije
    expect(src).toMatch(/applyAct\.mutate\(\{\s*expenseId,\s*act:\s*'A1'\s*\}\)/);
    expect(src).toMatch(/applyAct\.mutate\(\{\s*expenseId,\s*act:\s*'A2'\s*\}\)/);
    expect(src).toMatch(/applyAct\.mutate\(\{\s*expenseId,\s*act:\s*'A5'\s*\}\)/);
    expect(src).toMatch(/withdraw\.mutate\(\{\s*expenseId\s*\}\)/);
    // Broj mjesta gdje se onReassignSuccess poziva mora biti točno 3
    // (setPrivacy + retract + govern).
    const calls = src.match(/onReassignSuccess\?\.\(\)/g) ?? [];
    expect(calls.length).toBe(3);
  });

  it('OK set-ovi su definirani i pokrivaju noop_already_in_target_state', () => {
    expect(src).toMatch(/SET_PRIVACY_OK[\s\S]{0,200}noop_already_in_target_state/);
    expect(src).toMatch(/RETRACT_OK[\s\S]{0,80}noop_already_in_target_state/);
    expect(src).toMatch(/GOVERN_OK[\s\S]{0,80}noop_already_in_target_state/);
  });
});

describe('TransactionDetailDialog — auto-close bridge', () => {
  const src = read('src/components/TransactionDetailDialog.tsx');

  it('prosljeđuje onReassignSuccess → onOpenChange(false)', () => {
    expect(src).toMatch(
      /<KrugTransactionPanel[\s\S]{0,300}onReassignSuccess=\{\(\)\s*=>\s*onOpenChange\(false\)\}/,
    );
  });

  it('panel se ne renderira u readOnlyKrug modu (Odlučeno flow ostaje netaknut)', () => {
    expect(src).toMatch(/expense\.type\s*!==\s*'transfer'\s*&&\s*!readOnlyKrug/);
  });
});
