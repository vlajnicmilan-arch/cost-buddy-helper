/**
 * ČUVAR — mail obavijesti.
 *
 * 1) UKINUTO PONAVLJANJE (5.9.2026): `mail-process` više NE upisuje obavijest
 *    tipa `mail_document_pending`. Istu činjenicu stalno nosi red „Dokumenti"
 *    na početnom ekranu. Push pri dolasku ostaje.
 * 2) SHEMA: preostali upisi u `notifications` moraju koristiti ISKLJUČIVO
 *    stupce koji stvarno postoje (types.ts). Kvar iz kolovoza 2026: worker je
 *    slao `title_key`/`body_key`/`dedup_ref` → INSERT je tiho pucao.
 * 3) VIDLJIVOST: greška upisa se ne smije gutati.
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

const insertBlocks = [...src.matchAll(/\.from\("notifications"\)\.insert\(\{/g)].map((m) =>
  src.slice(m.index ?? 0, (m.index ?? 0) + 700),
);

describe('mail-process → notifications insert', () => {
  it('koristi samo stupce koji postoje u shemi', () => {
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
    expect(insertBlocks.length).toBeGreaterThan(0);
    for (const block of insertBlocks) {
      const keys = [...block.matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);
      for (const key of keys) {
        expect(allowed).toContain(key as keyof NotificationInsert);
      }
    }
  });

  it('ne koristi izmišljene stupce iz kvara', () => {
    expect(src).not.toMatch(/(^|[^_\w])title_key:/m);
    expect(src).not.toMatch(/(^|[^_\w])body_key:/m);
    expect(src).not.toMatch(/(^|[^_\w])dedup_ref:/m);
  });

  it('obavijest mail_document_pending se više ne upisuje', () => {
    for (const block of insertBlocks) {
      expect(block).not.toContain('type: "mail_document_pending"');
    }
    expect(src).not.toContain('dedup_key: `mail_document_pending:${itemId}`');
  });

  it('greška upisa obavijesti se logira vidljivo', () => {
    expect(src).toMatch(/if \(error[\s\S]{0,80}\) \{[\s\S]{0,200}console\.error/);
  });

  it('push pri dolasku ostaje, s rutom na /dokumenti', () => {
    expect(src).toContain('sendPushNotification({');
    expect(src).toContain('category: "pending"');
    expect(src).toContain('source: "mail-process"');
    expect(src).toContain('"/dokumenti"');
  });
});
