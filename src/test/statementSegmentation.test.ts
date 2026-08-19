/**
 * ČUVAR — segmentirano čitanje velikih izvoda.
 *
 * Sudac je DOSLOVAN tekst korisnikova Revolut izvoda iz baze
 * (`inbound_attachments.extracted_text`, privitak 9aef32ef…, 14 stranica).
 * Segmentacija ne smije izgubiti ni jedan redak, ni jedan udvostručiti,
 * a šav ne smije pasti usred transakcije.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEGMENT_THRESHOLD_CHARS,
  blockYieldFailure,
  buildBlockContext,
  buildBlockPayload,
  countCandidateRows,
  segmentStatementLines,
  segmentStatementText,
  shouldSegment,
} from '../../supabase/functions/_shared/statement/segmentText';
import {
  isRowContinuation,
  splitStatementLines,
} from '../../supabase/functions/_shared/statement/rawLineMatch';

const REVOLUT_FULL = readFileSync(
  join(__dirname, 'fixtures/revolutStatementFull.txt'),
  'utf8',
);

const ERSTE_SMALL = [
  'ERSTE&STEIERMÄRKISCHE BANK d.d.',
  'IBAN: HR1224020061100000000',
  'Datum Opis Duguje Potražuje Stanje',
  '01.07.2025. KONZUM ZAGREB 12,50 1.000,00',
  '02.07.2025. PLAĆA 1.500,00 2.500,00',
  '03.07.2025. INA ZADAR 45,00 2.455,00',
].join('\n');

describe('segmentacija velikih izvoda', () => {
  it('mali izvod (ispod praga) ostaje jedan poziv', () => {
    expect(ERSTE_SMALL.length).toBeLessThan(SEGMENT_THRESHOLD_CHARS);
    expect(shouldSegment(ERSTE_SMALL)).toBe(false);
  });

  it('veliki Revolut izvod prelazi prag i dijeli se u više blokova', () => {
    expect(shouldSegment(REVOLUT_FULL)).toBe(true);
    const blocks = segmentStatementText(REVOLUT_FULL);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((b) => b.total === blocks.length)).toBe(true);
  });

  it('unija blokova je cijeli tekst, redoslijedom i bez duplikata', () => {
    const lines = splitStatementLines(REVOLUT_FULL);
    const blocks = segmentStatementLines(lines);
    const rejoined = blocks.flatMap((b) => [...b.lines]);
    expect(rejoined).toEqual(lines);
  });

  it('šav nikad ne siječe transakcijski redak (granica nije nastavak)', () => {
    const blocks = segmentStatementLines(splitStatementLines(REVOLUT_FULL));
    for (const block of blocks.slice(1)) {
      expect(isRowContinuation(block.lines[0])).toBe(false);
    }
  });

  it('zbroj vidljivih redaka po blokovima jednak je zbroju nad cijelim tekstom', () => {
    const lines = splitStatementLines(REVOLUT_FULL);
    const whole = countCandidateRows(lines);
    const blocks = segmentStatementLines(lines);
    const summed = blocks.reduce((n, b) => n + b.candidateRows, 0);
    expect(whole).toBeGreaterThan(100);
    expect(summed).toBe(whole);
  });

  it('simulirani segmentirani prolaz vraća točno onoliko redaka koliko ih izvod ima', () => {
    const lines = splitStatementLines(REVOLUT_FULL);
    const expected = countCandidateRows(lines);
    const blocks = segmentStatementLines(lines);
    // Lažni čitač: jedna transakcija po vidljivom retku bloka.
    const merged = blocks.flatMap((b) => b.lines.filter((l) => !isRowContinuation(l) && b.candidateRows > 0))
      .filter((l) => countCandidateRows([l]) === 1);
    expect(merged.length).toBe(expected);
    expect(new Set(merged).size).toBeGreaterThan(0);
  });

  it('kontekst nosi valutu i format datuma, isti za svaki blok', () => {
    const lines = splitStatementLines(REVOLUT_FULL);
    const context = buildBlockContext(lines);
    expect(context).toContain('Valuta');
    expect(context).toContain('Format datuma');
    const blocks = segmentStatementLines(lines);
    const payload = buildBlockPayload(blocks[1], context);
    expect(payload).toContain(blocks[1].label);
    expect(payload).toContain('Valuta');
  });

  it('zaglavlje (banka/IBAN/razdoblje/saldo) ostaje u prvom bloku netaknuto', () => {
    const blocks = segmentStatementLines(splitStatementLines(REVOLUT_FULL));
    const first = blocks[0].lines.join('\n');
    expect(first).toContain('Revolut Bank UAB');
    expect(first).toContain('Sažetak salda');
    expect(first).toContain('4.957,71');
    // IBAN je niže u dokumentu, ali mora postojati točno jednom kroz sve blokove.
    const all = blocks.flatMap((b) => b.lines).filter((l) => l.includes('LT183250041594525319'));
    expect(all.length).toBe(1);
  });

  it('blok koji vrati manje pada GLASNO i imenuje blok', () => {
    const blocks = segmentStatementLines(splitStatementLines(REVOLUT_FULL));
    const block = blocks.find((b) => b.candidateRows > 4)!;
    const failure = blockYieldFailure(block, 1);
    expect(failure).toContain('parse_incomplete');
    expect(failure).toContain(block.label);
    expect(blockYieldFailure(block, block.candidateRows)).toBeNull();
  });

  it('blok bez vidljivih redaka ne pada (zaglavlje/naslovi)', () => {
    const blocks = segmentStatementLines(['Revolut Bank UAB', 'Sažetak salda']);
    expect(blocks[0].candidateRows).toBe(0);
    expect(blockYieldFailure(blocks[0], 0)).toBeNull();
  });
});
