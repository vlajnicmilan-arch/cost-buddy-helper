/**
 * ČUVAR — obavijest samo za svježu poštu.
 *
 * Kvar (17.8.2026): korisnika je zasuo val `mail_document_pending` obavijesti.
 * Pravilo koje ovaj čuvar drži: obrada NE smije zvoniti za poruku stariju od
 * 24 h, osim kad je korisnik izričito pokrenuo ponovnu obradu.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  shouldNotifyPending,
  NOTIFY_MAX_MESSAGE_AGE_MS,
} from '../../supabase/functions/_shared/mailImport/notifyAgeGuard.ts';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

const NOW = Date.parse('2026-08-17T18:00:00Z');

describe('shouldNotifyPending', () => {
  it('svježa poruka zvoni', () => {
    expect(
      shouldNotifyPending({ receivedAt: '2026-08-17T17:30:00Z', now: NOW, manualReprocess: false }),
    ).toBe(true);
  });

  it('poruka starija od 24 h NE zvoni u automatskoj obradi', () => {
    expect(
      shouldNotifyPending({ receivedAt: '2026-08-16T17:00:00Z', now: NOW, manualReprocess: false }),
    ).toBe(false);
  });

  it('izričit korisnički reprocess zvoni bez obzira na starost', () => {
    expect(
      shouldNotifyPending({ receivedAt: '2025-01-01T00:00:00Z', now: NOW, manualReprocess: true }),
    ).toBe(true);
  });

  it('nepoznato/neispravno vrijeme dolaska ne zvoni', () => {
    expect(shouldNotifyPending({ receivedAt: null, now: NOW, manualReprocess: false })).toBe(false);
    expect(shouldNotifyPending({ receivedAt: 'jučer', now: NOW, manualReprocess: false })).toBe(false);
  });

  it('granica je točno 24 h', () => {
    expect(NOTIFY_MAX_MESSAGE_AGE_MS).toBe(24 * 60 * 60 * 1000);
    const edge = new Date(NOW - NOTIFY_MAX_MESSAGE_AGE_MS).toISOString();
    expect(shouldNotifyPending({ receivedAt: edge, now: NOW, manualReprocess: false })).toBe(true);
  });
});

describe('mail-process — brana je ugrađena u tok', () => {
  const worker = read('supabase/functions/mail-process/index.ts');

  it('worker koristi zajedničku branu', () => {
    expect(worker).toContain('shouldNotifyPending');
    expect(worker).toContain('notifyAgeGuard.ts');
  });

  it('nijedan poziv notifyPending nije bezuvjetan', () => {
    const calls = [...worker.matchAll(/await notifyPending\(/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      const before = worker.slice(Math.max(0, c.index! - 400), c.index!);
      expect(before).toMatch(/notifyAllowed|shouldNotifyPending/);
    }
  });

  it('ručni reprocess je označen u redu poslova', () => {
    expect(worker).toContain('job.manual');
  });
});

describe('migracija — oznaka ručne obrade', () => {
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  const sql = fs
    .readdirSync(dir)
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');

  it('ingest_jobs ima stupac manual i claim ga vraća', () => {
    expect(sql).toMatch(/ingest_jobs[\s\S]{0,80}ADD COLUMN IF NOT EXISTS manual boolean/i);
    expect(sql).toMatch(/mail_ingest_claim_jobs[\s\S]{0,400}manual boolean/);
  });

  it('mail_ingest_retry_message postavlja manual = true', () => {
    expect(sql).toMatch(/mail_ingest_retry_message[\s\S]{0,2000}manual = true/);
  });
});
