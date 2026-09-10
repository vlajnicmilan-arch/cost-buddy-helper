import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DRIVE_ROOT_FOLDER_NAME,
  GOOGLE_TOKEN_URL,
  createDriveClient,
  driveMailLine,
  foldersToTrash,
  planDriveUploads,
} from '../../supabase/functions/_shared/googleDrive';

beforeEach(() => {
  process.env.GDRIVE_CLIENT_ID = 'cid';
  process.env.GDRIVE_CLIENT_SECRET = 'csecret';
  process.env.GDRIVE_REFRESH_TOKEN = 'rtoken';
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('getAccessToken', () => {
  it('šalje ispravan refresh-token zahtjev', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes({ access_token: 'at-1' }));
    const drive = createDriveClient(fetchMock as unknown as typeof fetch);

    expect(await drive.getAccessToken()).toBe('at-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(init.method).toBe('POST');
    const params = new URLSearchParams(init.body as string);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('client_id')).toBe('cid');
    expect(params.get('client_secret')).toBe('csecret');
    expect(params.get('refresh_token')).toBe('rtoken');

    // Token se keširа unutar jednog pokretanja.
    await drive.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ensureFolder', () => {
  it('ne stvara duplikat kad mapa već postoji', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at' }))
      .mockResolvedValueOnce(jsonRes({ files: [{ id: 'folder-1', name: DRIVE_ROOT_FOLDER_NAME }] }));
    const drive = createDriveClient(fetchMock as unknown as typeof fetch);

    expect(await drive.ensureFolder(DRIVE_ROOT_FOLDER_NAME)).toBe('folder-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST' && init?.body?.includes?.('mimeType'))).toBe(
      false,
    );
  });
});

describe('planDriveUploads', () => {
  it('preskače datoteke s istim imenom i veličinom', () => {
    const existing = [
      { id: '1', name: 'centar-backup-2026-09-10.zip', size: 100 },
      { id: '2', name: 'centar-files-2026-09-10-1.zip', size: 50 },
    ];
    const wanted = [
      { name: 'centar-backup-2026-09-10.zip', size: 100, path: '2026-09-10/centar-backup-2026-09-10.zip' },
      { name: 'centar-files-2026-09-10-1.zip', size: 60, path: '2026-09-10/centar-files-2026-09-10-1.zip' },
      { name: 'manifest.json', size: 10, path: '2026-09-10/manifest.json' },
    ];
    const plan = planDriveUploads(existing, wanted);
    expect(plan.skipped.map((f) => f.name)).toEqual(['centar-backup-2026-09-10.zip']);
    expect(plan.upload.map((f) => f.name)).toEqual(['centar-files-2026-09-10-1.zip', 'manifest.json']);
  });
});

describe('foldersToTrash', () => {
  it('zadržava zadnjih 8 datumskih mapa', () => {
    const folders = Array.from({ length: 11 }, (_, i) => ({
      id: `id-${i}`,
      name: `2026-09-${String(i + 1).padStart(2, '0')}`,
    }));
    const trash = foldersToTrash([...folders].reverse());
    expect(trash.map((f) => f.name)).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
  });

  it('ignorira mape koje nisu datumi', () => {
    const trash = foldersToTrash([{ id: 'x', name: 'nešto drugo' }], 0);
    expect(trash).toEqual([]);
  });
});

describe('driveMailLine', () => {
  it('uspjeh sadrži Drive redak s mapom i linkom', () => {
    const line = driveMailLine({
      ok: true,
      folder: '2026-09-10',
      files: 6,
      bytes: 160 * 1024 * 1024,
      webViewLink: 'https://drive.google.com/drive/folders/abc',
    });
    expect(line.text).toContain(`Kopija na Google Driveu: ${DRIVE_ROOT_FOLDER_NAME}/2026-09-10 — 6 datoteka, 160.0 MB`);
    expect(line.html).toContain('https://drive.google.com/drive/folders/abc');
  });

  it('neuspjeh sadrži jasnu napomenu', () => {
    const line = driveMailLine({ ok: false, error: 'token 401' });
    expect(line.text).toContain('Drive NIJE uspio: token 401');
    expect(line.html).toContain('Drive NIJE uspio');
  });
});
