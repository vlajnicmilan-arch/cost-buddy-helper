/**
 * ČUVAR — životni vijek obavijesti `mail_document_pending`.
 *
 * Kvar (kolovoz 2026): obavijest je ostala „active" i nepročitana i nakon što
 * je dokument uvezen (stavka `povezan`), pa je „Za pažnju" tvrdila da nešto
 * čeka na pregled dok na pregledu nije bilo ničega — uz to duplirajući
 * jantarnu karticu u /dokumenti.
 *
 * Tri pravila koja ovaj čuvar drži:
 * 1. Obavijest nosi dedup oznaku vezanu uz stavku (bez duplikata pri reprocessu).
 * 2. Okidač u bazi gasi obavijest čim stavka napusti `na_pregledu`, uz
 *    jednokratni backfill visećih obavijesti.
 * 3. „Za pažnju" (useActiveIssues) NE prikazuje taj tip — kartica JE obavijest.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');

const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
const migrationSql = fs
  .readdirSync(migrationsDir)
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  .join('\n');

describe('mail_document_pending — samogašenje', () => {
  it('worker upisuje dedup oznaku vezanu uz stavku', () => {
    const worker = read('supabase/functions/mail-process/index.ts');
    expect(worker).toContain('dedup_key: `mail_document_pending:${upserted.id}`');
    // Duplikat (23505) nije kvar nego dedup — ne smije se logirati kao greška.
    expect(worker).toContain('notifError.code !== "23505"');
  });

  it('baza ima okidač koji gasi obavijest kad stavka napusti na_pregledu', () => {
    expect(migrationSql).toContain('mail_resolve_pending_notification');
    expect(migrationSql).toContain('AFTER UPDATE OF status ON public.document_ingest_items');
    expect(migrationSql).toMatch(/NEW\.status IS DISTINCT FROM 'na_pregledu'/);
    expect(migrationSql).toMatch(/status = 'resolved'/);
  });

  it('migracija sadrži backfill visećih obavijesti', () => {
    expect(migrationSql).toMatch(
      /UPDATE public\.notifications[\s\S]{0,600}NOT EXISTS[\s\S]{0,300}document_ingest_items[\s\S]{0,200}na_pregledu/,
    );
  });

  it('„Za pažnju" izuzima mail_document_pending', () => {
    const hook = read('src/hooks/useActiveIssues.ts');
    expect(hook).toContain('.neq("type", "mail_document_pending")');
  });

  it('signal dolaska ostaje (zvono + push)', () => {
    const worker = read('supabase/functions/mail-process/index.ts');
    expect(worker).toContain('sendPushNotification({');
    expect(worker).toContain('.from("notifications").insert({');
  });
});
