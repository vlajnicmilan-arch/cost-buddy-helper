/**
 * MAIL UVOZ — čuvari za dva živa kvara (9.8.2026.):
 *
 * KVAR A: privitak "Račun.pdf" → Storage `InvalidKey` → 500 → Mailgun ponavlja
 *         → poruka NIKAD ne nastane (nula zapisa za korisnika). Ključ pohrane
 *         od sada je ASCII-siguran, ime datoteke nikad ne ide sirovo.
 * KVAR B: ekran je pri svakom dohvatu stvarao NOVI alias (7 aktivnih u 3 min).
 *         Sada get-or-create u bazi + parcijalni unique indeks.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  sanitizeStorageSegment,
  ATTACHMENT_TOO_LARGE,
} from '../../supabase/functions/_shared/mailImport/storageKey.ts';

const INGEST = readFileSync('supabase/functions/mail-ingest/index.ts', 'utf8');
const HOOK = readFileSync('src/hooks/useMailInbox.ts', 'utf8');

const migrations = readdirSync('supabase/migrations')
  .sort()
  .map((f) => readFileSync(join('supabase/migrations', f), 'utf8'));
const aliasSql = migrations.filter((s) => s.includes('mail_alias_get_or_create')).slice(-1)[0] ?? '';

// ------------------------------------------------------------------ KVAR A

describe('KVAR A — ključ pohrane je ASCII-siguran', () => {
  it('hrvatska dijakritika se prevodi, nastavak ostaje', () => {
    expect(sanitizeStorageSegment('Račun.pdf')).toBe('Racun.pdf');
    expect(sanitizeStorageSegment('Ponuda-šđčćž.PDF')).toBe('Ponuda-sdccz.PDF');
  });

  it('razmaci i egzotični znakovi ne ostaju u ključu', () => {
    const out = sanitizeStorageSegment('IMG 2026 「foto」.jpeg');
    expect(out).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('prazno ili potpuno nevaljano ime dobiva rezervu', () => {
    expect(sanitizeStorageSegment('')).toBe('privitak');
    expect(sanitizeStorageSegment('。。。')).toBe('privitak');
  });

  it('mail-ingest ne slaže putanju od sirovog imena datoteke', () => {
    expect(INGEST).toContain('sanitizeStorageSegment');
    expect(INGEST).not.toContain('${value.name || "privitak"}');
  });
});

describe('KVAR A — prevelik privitak je VIDLJIV, nikad tih', () => {
  it('petlja ne prekida obradu s 413 nego bilježi razlog', () => {
    expect(INGEST).toContain('ATTACHMENT_TOO_LARGE');
    expect(ATTACHMENT_TOO_LARGE).toBe('privitak_prevelik');

    expect(INGEST).toContain('quarantine_reason: ATTACHMENT_TOO_LARGE');
    expect(INGEST).toContain('incomplete: "true"');
    expect(INGEST).not.toMatch(/totalBytes > MAX_TOTAL_BYTES\) return json/);
  });

  it('poruka se svejedno sprema (dam razlog umjesto odbacivanja)', () => {
    expect(INGEST).toMatch(/damReason\s*=\s*oversize\s*\?\s*ATTACHMENT_TOO_LARGE/);
  });

  it('razlog ima prijevod u hr/en/de', () => {
    for (const loc of ['hr', 'en', 'de']) {
      const cat = JSON.parse(readFileSync(`src/i18n/locales/${loc}.json`, 'utf8'));
      expect(cat.mailImport.reason[ATTACHMENT_TOO_LARGE]).toBeTruthy();
    }
  });
});

// ------------------------------------------------------------------ KVAR B

describe('KVAR B — jedan aktivan alias po korisniku', () => {
  it('hook koristi get-or-create RPC, ne izravan insert', () => {
    expect(HOOK).toContain("supabase.rpc('mail_alias_get_or_create')");
    expect(HOOK).toContain("supabase.rpc('mail_alias_regenerate')");
    expect(HOOK).not.toMatch(/from\('mail_aliases'\)[\s\S]{0,80}\.insert\(/);
    expect(HOOK).not.toContain('generateAliasLocal');
  });

  it('migracija sanira postojeće: preživljava NAJSTARIJI aktivan', () => {
    expect(aliasSql).toContain('PARTITION BY user_id ORDER BY created_at ASC');
    expect(aliasSql).toMatch(/SET disabled_at = now\(\)[\s\S]{0,120}rn > 1/);
  });

  it('sanacija dolazi PRIJE unique indeksa', () => {
    const fix = aliasSql.indexOf('rn > 1');
    const idx = aliasSql.indexOf('uniq_mail_alias_active_per_user');
    expect(fix).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(fix);
  });

  it('parcijalni unique indeks pokriva samo aktivne aliase', () => {
    expect(aliasSql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]{0,120}mail_aliases \(user_id\)[\s\S]{0,60}WHERE disabled_at IS NULL/,
    );
  });

  it('regeneracija gasi staru pa stvara novu u istoj funkciji', () => {
    const fn = aliasSql.slice(aliasSql.indexOf('mail_alias_regenerate'));
    const off = fn.indexOf('SET disabled_at = now()');
    const ins = fn.indexOf('INSERT INTO public.mail_aliases');
    expect(off).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(off);
  });

  it('prijem i dalje odbija ugašeni alias', () => {
    expect(INGEST).toContain('.is("disabled_at", null)');
    expect(INGEST).toContain('unknown_alias');
  });
});
