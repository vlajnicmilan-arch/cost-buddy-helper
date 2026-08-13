/**
 * VEZA „mail kartica izvoda → zabilježeni uvoz".
 *
 * Kartica pokreće postojeći uvoz i onda može nestati (navigacija, pad,
 * nastavak skice sutra). Zato se veza stavka ↔ uvoz zapisuje u localStorage i
 * razrješava tek kad uvoz JAVI da je stvarno zapisan
 * (`vm:pdf-import-completed`). Pad ili odustajanje ne javljaju ništa, pa
 * stavka ostaje „na pregledu" — točno kako mora biti.
 */

export const MAIL_STATEMENT_LINK_KEY = 'vmb-mail-statement-link:v1';
export const MAIL_STATEMENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingStatementLink {
  readonly itemId: string;
  readonly sourceId: string;
  readonly fileName: string | null;
  readonly savedAt: number;
}

export interface ImportCompletedSignal {
  readonly sourceId: string | null;
  readonly fileName: string | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(override?: StorageLike | null): StorageLike | null {
  if (override) return override;
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePendingStatementLink(
  link: PendingStatementLink,
  storage?: StorageLike | null,
): void {
  const s = getStorage(storage);
  if (!s || !link.itemId || !link.sourceId) return;
  try {
    s.setItem(MAIL_STATEMENT_LINK_KEY, JSON.stringify(link));
  } catch {
    /* noop */
  }
}

export function loadPendingStatementLink(
  opts: { now?: number; storage?: StorageLike | null } = {},
): PendingStatementLink | null {
  const s = getStorage(opts.storage);
  if (!s) return null;
  const now = opts.now ?? Date.now();
  try {
    const raw = s.getItem(MAIL_STATEMENT_LINK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStatementLink;
    if (!parsed?.itemId || !parsed?.sourceId) return null;
    if (now - (parsed.savedAt ?? 0) > MAIL_STATEMENT_LINK_TTL_MS) {
      s.removeItem(MAIL_STATEMENT_LINK_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingStatementLink(storage?: StorageLike | null): void {
  const s = getStorage(storage);
  if (!s) return;
  try {
    s.removeItem(MAIL_STATEMENT_LINK_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Uvoz je zapisan — pripada li on zapamćenoj stavci?
 * Novčanik mora biti isti; ime datoteke se uspoređuje samo kad ga oba imaju.
 */
export function matchesPendingLink(
  link: PendingStatementLink | null,
  signal: ImportCompletedSignal,
): boolean {
  if (!link) return false;
  if (!signal.sourceId || signal.sourceId !== link.sourceId) return false;
  if (link.fileName && signal.fileName && link.fileName !== signal.fileName) return false;
  return true;
}
