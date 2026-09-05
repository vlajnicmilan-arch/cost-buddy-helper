/**
 * ČUVAR — „dokument čeka pregled" bez in-app obavijesti.
 *
 * Povijest: obavijest `mail_document_pending` je znala visjeti u „Za pažnju"
 * i nakon što je dokument uvezen, uz to duplirajući jantarnu karticu.
 * Od 5.9.2026 obavijest se VIŠE NE STVARA — istu činjenicu stalno nosi red
 * „Dokumenti" na početnom ekranu. Postojeći retci u bazi se ne diraju, a
 * okidač koji ih gasi ostaje na mjestu.
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

describe('mail_document_pending — ukinuta in-app obavijest', () => {
  it('worker više ne upisuje tu obavijest', () => {
    const worker = read('supabase/functions/mail-process/index.ts');
    expect(worker).not.toContain('type: "mail_document_pending",\n    title:');
    expect(worker).not.toContain('dedup_key: `mail_document_pending:${itemId}`');
  });

  it('okidač koji gasi zatečene obavijesti ostaje u bazi', () => {
    expect(migrationSql).toContain('mail_resolve_pending_notification');
    expect(migrationSql).toContain('AFTER UPDATE OF status ON public.document_ingest_items');
  });

  it('„Za pažnju" i dalje izuzima mail_document_pending', () => {
    const hook = read('src/hooks/useActiveIssues.ts');
    expect(hook).toContain('.neq("type", "mail_document_pending")');
  });

  it('signal dolaska ostaje kroz push', () => {
    const worker = read('supabase/functions/mail-process/index.ts');
    expect(worker).toContain('sendPushNotification({');
  });
});
