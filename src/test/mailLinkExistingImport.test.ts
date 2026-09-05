/**
 * Guard: veza „dokument iz maila → uvoz koji već postoji".
 * Nikad ne baca, svaki razlog ima svoj prijevod, neuspjeh ostavlja trag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const logDiagnostic = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/lib/diagnosticLogger', () => ({ logDiagnostic: (...a: unknown[]) => logDiagnostic(...a) }));
vi.mock('@/lib/buildStamp', () => ({ getBuildStamp: () => 'v-test|assets/index-test.js' }));

import {
  EXISTING_IMPORT_REASON_KEY,
  linkExistingImport,
  probeExistingImport,
} from '@/lib/mail/existingImportLink';
import hr from '@/i18n/locales/hr.json';

const key = (path: string) =>
  path.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], hr);

beforeEach(() => {
  rpc.mockReset();
  logDiagnostic.mockReset();
});

describe('probeExistingImport', () => {
  it('nađen uvoz vraća datum', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, found: true, statement_id: 's1', imported_at: '2026-09-03T04:39:00Z' },
      error: null,
    });
    const probe = await probeExistingImport('i1');
    expect(probe).toEqual({
      found: true,
      statementId: 's1',
      importedAt: '2026-09-03T04:39:00Z',
      reason: null,
    });
  });

  it('bez uvoza ne nudi ništa', async () => {
    rpc.mockResolvedValue({ data: { ok: true, found: false, reason: 'nema_postojeceg_uvoza' }, error: null });
    const probe = await probeExistingImport('i1');
    expect(probe.found).toBe(false);
    expect(probe.reason).toBe('nema_postojeceg_uvoza');
  });
});

describe('linkExistingImport', () => {
  it('uspjeh vraća uvoz', async () => {
    rpc.mockResolvedValue({ data: { ok: true, statement_id: 's1', imported_at: '2026-09-03T04:39:00Z' }, error: null });
    const r = await linkExistingImport('i1');
    expect(r).toEqual({ ok: true, statementId: 's1', importedAt: '2026-09-03T04:39:00Z' });
    expect(logDiagnostic).not.toHaveBeenCalled();
  });

  it('odbijanje se bilježi s razlogom i otiskom builda', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, reason: 'uvoz_vezan_na_drugi_dokument', candidates: 1, content_sha256: 'abc' },
      error: null,
    });
    const r = await linkExistingImport('i1');
    expect(r).toEqual({ ok: false, reason: 'uvoz_vezan_na_drugi_dokument' });
    const details = logDiagnostic.mock.calls[0][0].details;
    expect(details).toMatchObject({
      item_id: 'i1',
      reason: 'uvoz_vezan_na_drugi_dokument',
      candidates: 1,
      content_sha256: 'abc',
      build: 'v-test|assets/index-test.js',
    });
  });

  it('greška baze ne baca', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42501' } });
    await expect(linkExistingImport('i1')).resolves.toEqual({ ok: false, reason: 'baza' });
    expect(logDiagnostic).toHaveBeenCalled();
  });

  it('iznimka ne baca', async () => {
    rpc.mockRejectedValue(new Error('mreža'));
    await expect(linkExistingImport('i1')).resolves.toEqual({ ok: false, reason: 'baza' });
  });
});

describe('prijevodi', () => {
  it('svaki razlog ima hrvatski tekst', () => {
    for (const path of Object.values(EXISTING_IMPORT_REASON_KEY)) {
      expect(typeof key(path)).toBe('string');
    }
    expect(key('statements.linkExisting.action')).toBe('Poveži s postojećim uvozom');
  });
});
