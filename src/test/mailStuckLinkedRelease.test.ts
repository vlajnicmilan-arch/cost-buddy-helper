import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canTransitionDocument } from '@/lib/ingestStateMachines';

/**
 * MRTVI DOKUMENTI U LIJEVKU — tri pravila.
 *
 * 1. Dokument NE postaje `povezan` bez uvoza koji na njega pokazuje.
 * 2. Poništenje uvoza vraća dokument u obradu, u ISTOJ transakciji.
 * 3. Dokument s postojećim uvozom se NE može osloboditi.
 *
 * Pravila žive u SQL-u (jedini poslužiteljski izvor istine), pa ih test čita
 * iz migracije — klijentski `update` više ne postoji kao put.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function latestMigrationContaining(needle: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const body = readFileSync(join(MIGRATIONS_DIR, files[i]), 'utf8');
    if (body.includes(needle)) return body;
  }
  throw new Error(`migracija s "${needle}" nije pronađena`);
}

describe('mail lijevak — status povezan bez uvoza', () => {
  it('1. povezan se piše samo kad uvoz pokazuje na dokument', () => {
    const sql = latestMigrationContaining('FUNCTION public.mail_item_mark_linked');
    const fn = sql.slice(sql.indexOf('FUNCTION public.mail_item_mark_linked'));
    expect(fn).toContain('s.source_document_item_id = p_item_id');
    expect(fn).toContain("'uvoz_ne_postoji'");
    // Provjera je PRIJE upisa statusa.
    expect(fn.indexOf("'uvoz_ne_postoji'")).toBeLessThan(fn.indexOf("SET status = 'povezan'"));
  });

  it('1b. klijent više ne piše status izravno, nego kroz RPC', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/useStatementImport.ts'), 'utf8');
    expect(src).toContain('mail_item_mark_linked');
    expect(src).not.toContain("update({ status: 'povezan' })");
  });

  it('2. poništenje uvoza vraća dokument u obradu u istoj transakciji', () => {
    const sql = latestMigrationContaining('FUNCTION public.undo_import_batch');
    const fn = sql.slice(sql.indexOf('FUNCTION public.undo_import_batch'));
    const collect = fn.indexOf('SELECT array_agg(id) INTO v_stmt_ids');
    const del = fn.indexOf('DELETE FROM public.imported_statements');
    const release = fn.indexOf("SET status = 'na_pregledu'");
    // Veze se skupljaju PRIJE brisanja izvoda, a vraćanje se događa nakon njega
    // — sve unutar tijela iste funkcije, dakle iste transakcije.
    expect(collect).toBeGreaterThan(-1);
    expect(collect).toBeLessThan(del);
    expect(release).toBeGreaterThan(del);
    expect(fn).toContain('v_item_ids');
    // Nema zasebne funkcije/naknadnog popravka: sve je u jednom tijelu.
    expect(fn.slice(collect, release)).not.toContain('COMMIT');
  });

  it('3. oslobađanje se odbija kad uvoz postoji', () => {
    const sql = latestMigrationContaining('FUNCTION public.mail_item_release_linked');
    const fn = sql.slice(sql.indexOf('FUNCTION public.mail_item_release_linked'));
    expect(fn).toContain('s.source_document_item_id = p_item_id');
    expect(fn).toContain("'uvoz_postoji'");
    expect(fn).toContain("l.target_type = 'imported_statement'");
    expect(fn).toContain("l.target_type = 'incoming_invoice'");
    // Odbijanje ide PRIJE ikakve promjene stanja.
    expect(fn.indexOf("'uvoz_postoji'")).toBeLessThan(fn.indexOf("SET status = 'na_pregledu'"));
    // Ništa se ne briše osim mrtve poveznice.
    expect(fn).not.toContain('DELETE FROM public.document_ingest_items');
    expect(fn).not.toContain('DELETE FROM public.expenses');
    expect(fn).not.toContain('DELETE FROM public.imported_statements');
  });

  it('stroj stanja dopušta povezan -> na_pregledu i ništa više', () => {
    expect(canTransitionDocument('povezan', 'na_pregledu')).toBe(true);
    expect(canTransitionDocument('povezan', 'potvrdjen')).toBe(false);
    expect(canTransitionDocument('povezan', 'odbacio_korisnik')).toBe(false);
  });
});
