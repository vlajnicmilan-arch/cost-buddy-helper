/**
 * ČUVAR — mail obavijesti.
 *
 * 1) SHEMA: payload koji `mail-process` upisuje u `notifications` mora koristiti
 *    ISKLJUČIVO stupce koji stvarno postoje (types.ts). Kvar iz kolovoza 2026:
 *    worker je slao `title_key`/`body_key`/`dedup_ref` → INSERT je tiho pucao i
 *    nijedna mail obavijest nikad nije nastala.
 * 2) VIDLJIVOST: greška upisa se ne smije gutati.
 * 3) PUSH: ide kroz postojeći sustav (sendPushNotification + kategorija).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Database } from '@/integrations/supabase/types';

const WORKER = path.resolve(
  __dirname,
  '../../supabase/functions/mail-process/index.ts',
);
const src = fs.readFileSync(WORKER, 'utf8');

type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

const insertBlock = (() => {
  const start = src.indexOf('.from("notifications").insert({');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, start + 500);
})();

describe('mail-process → notifications insert', () => {
  it('koristi samo stupce koji postoje u shemi', () => {
    const keys = [...insertBlock.matchAll(/^\s{8}([a-z_]+):/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    const allowed: Array<keyof NotificationInsert> = [
      'user_id',
      'type',
      'title',
      'message',
      'data',
      'read',
      'status',
      'dedup_key',
      'severity',
    ];
    for (const key of keys) {
      expect(allowed).toContain(key as keyof NotificationInsert);
    }
  });

  it('ne koristi izmišljene stupce iz kvara', () => {
    expect(src).not.toMatch(/(^|[^_\w])title_key:/m);
    expect(src).not.toMatch(/(^|[^_\w])body_key:/m);
    expect(src).not.toMatch(/(^|[^_\w])dedup_ref:/m);
  });


  it('nosi i18n ključeve i rutu na /dokumenti', () => {
    expect(insertBlock).toContain('notifications.mail.pending.title');
    expect(insertBlock).toContain('notifications.mail.pending.body');
    expect(src).toContain('"/dokumenti"');
    expect(src).toContain('mail_document_pending');
  });

  it('greška upisa obavijesti se logira vidljivo', () => {
    expect(src).toMatch(/if \(notifError[\s\S]{0,80}\) \{[\s\S]{0,200}console\.error/);
  });

  it('nosi dedup oznaku vezanu uz stavku (samogašenje + bez duplikata)', () => {
    expect(insertBlock).toContain('dedup_key: `mail_document_pending:${upserted.id}`');
  });

  it('push ide kroz postojeći sendPushNotification uz kategoriju', () => {
    expect(src).toContain('sendPushNotification({');
    expect(src).toContain('category: "pending"');
    expect(src).toContain('source: "mail-process"');
  });
});
