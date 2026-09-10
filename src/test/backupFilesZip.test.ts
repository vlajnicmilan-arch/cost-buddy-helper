import { describe, it, expect } from 'vitest';
import {
  planFileParts,
  buildFilesManifest,
  zipEntryPath,
  filesZipName,
  type BackupFileRef,
} from '../../supabase/functions/_shared/backupFilesZip';

const mk = (bucket: string, path: string, size: number): BackupFileRef => ({
  bucket,
  path,
  size,
  stored_at: `_files/${bucket}/${path}`,
});

describe('planFileParts', () => {
  it('dijeli datoteke po pragu', () => {
    const files = [mk('receipts', 'a.jpg', 40), mk('receipts', 'b.jpg', 40), mk('receipts', 'c.jpg', 10)];
    const parts = planFileParts(files, 50);
    expect(parts.map((p) => p.map((f) => f.path))).toEqual([['a.jpg'], ['b.jpg', 'c.jpg']]);
  });

  it('nijedan dio ne prelazi prag kad je moguće', () => {
    const files = Array.from({ length: 10 }, (_, i) => mk('receipts', `f${i}.jpg`, 12));
    const parts = planFileParts(files, 50);
    for (const p of parts) {
      expect(p.reduce((a, f) => a + f.size, 0)).toBeLessThanOrEqual(50);
    }
  });

  it('datoteka veća od praga ide u vlastiti dio', () => {
    const files = [mk('receipts', 'small.jpg', 5), mk('receipts', 'huge.bin', 120), mk('receipts', 'tail.jpg', 5)];
    const parts = planFileParts(files, 50);
    expect(parts).toHaveLength(3);
    expect(parts[1][0].path).toBe('huge.bin');
  });

  it('prazan ulaz daje nula dijelova', () => {
    expect(planFileParts([], 50)).toEqual([]);
  });
});

describe('manifest i putanje', () => {
  it('manifest pokriva sve datoteke s brojem dijela od 1', () => {
    const files = [
      mk('receipts', 'a.jpg', 40),
      mk('inbound-mail', 'x/y.pdf', 40),
      mk('project-documents', 'p.pdf', 10),
    ];
    const parts = planFileParts(files, 50);
    const manifest = buildFilesManifest(parts);
    expect(manifest).toHaveLength(files.length);
    expect(manifest.map((m) => `${m.bucket}/${m.path}`).sort()).toEqual(
      files.map((f) => `${f.bucket}/${f.path}`).sort(),
    );
    expect(Math.min(...manifest.map((m) => m.part))).toBe(1);
    expect(manifest.find((m) => m.path === 'x/y.pdf')?.part).toBe(2);
  });

  it('putanja u zipu je <bucket>/<path>', () => {
    expect(zipEntryPath(mk('inbound-mail', 'msg/1/att.pdf', 1))).toBe('inbound-mail/msg/1/att.pdf');
  });

  it('ime dijela slijedi obrazac', () => {
    expect(filesZipName('2026-09-10', 2)).toBe('centar-files-2026-09-10-2.zip');
  });
});
