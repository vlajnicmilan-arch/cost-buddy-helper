// Čiste pomoćne funkcije za dijeljenje priloga u zip dijelove.
// Bez I/O — koriste ih i edge funkcija i testovi.

export type BackupFileRef = {
  bucket: string;
  path: string;
  size: number;
  stored_at: string;
};

export type FilesManifestEntry = {
  bucket: string;
  path: string;
  size: number;
  part: number;
};

/** Zadana granica jednog dijela: 50 MB. */
export const MAX_PART_BYTES = 50 * 1024 * 1024;

/** Putanja unutar zipa: `<bucket>/<originalna putanja>`. */
export function zipEntryPath(file: BackupFileRef): string {
  return `${file.bucket}/${file.path}`;
}

/**
 * Rasporedi datoteke u dijelove tako da nijedan dio ne prelazi prag
 * (osim kad je pojedina datoteka sama veća od praga — tada ide u vlastiti dio).
 */
export function planFileParts(
  files: readonly BackupFileRef[],
  maxPartBytes: number = MAX_PART_BYTES,
): BackupFileRef[][] {
  const parts: BackupFileRef[][] = [];
  let current: BackupFileRef[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const size = Math.max(0, Number(file.size) || 0);
    if (current.length > 0 && currentBytes + size > maxPartBytes) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** Manifest svih datoteka s brojem dijela (N počinje od 1). */
export function buildFilesManifest(parts: readonly BackupFileRef[][]): FilesManifestEntry[] {
  const out: FilesManifestEntry[] = [];
  parts.forEach((part, idx) => {
    for (const f of part) {
      out.push({ bucket: f.bucket, path: f.path, size: f.size, part: idx + 1 });
    }
  });
  return out;
}

/** Ime dijela: centar-files-YYYY-MM-DD-N.zip */
export function filesZipName(folder: string, part: number): string {
  return `centar-files-${folder}-${part}.zip`;
}
