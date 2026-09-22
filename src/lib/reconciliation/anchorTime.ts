/**
 * Vrijeme sidra — sprječava da se sidro postavi na IZMIŠLJENI sat.
 *
 * Okidač `expenses_event_at_sync` retku bez pravog vremena (time_confidence
 * C3/C4 — tipično uvezeni bankovni redak) upisuje podne po Zagrebu. Kad se
 * sidro veže za takav `event_at`, redci istog dana s pravim vremenom (C1/C2)
 * procure pokraj sidra i saldo ovisi o putu ulaska retka.
 *
 * Pravilo: kad `as_of` dolazi s retka BEZ pravog vremena, sidro ide na KRAJ
 * tog dana po Zagrebu (23:59:59). Redci istog dana tada ne mogu procuriti.
 * Kad redak ima pravo vrijeme (C1/C2), ono se koristi nepromijenjeno.
 *
 * Čisti modul bez ovisnosti — testiran u src/test/reconciliationAnchorTime.test.ts.
 */

const ZONE = 'Europe/Zagreb';

/** Vremenska konfidencija retka; sve osim C1/C2 znači "vrijeme je izmišljeno". */
export type TimeConfidence = 'C1' | 'C2' | 'C3' | 'C4' | string;

export function hasRealTime(confidence: TimeConfidence | null | undefined): boolean {
  return confidence === 'C1' || confidence === 'C2';
}

const parts = (date: Date): Record<string, number> => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  // Intl zna vratiti 24 za ponoć.
  if (out.hour === 24) out.hour = 0;
  return out;
};

/** Pomak zone (ms) u trenutku `date`. */
const zoneOffsetMs = (date: Date): number => {
  const p = parts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
};

/**
 * ISO timestamp kraja kalendarskog dana (23:59:59 po Zagrebu) u kojem se
 * nalazi zadani trenutak. Vraća null za neispravan ulaz.
 */
export function endOfZagrebDayIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  const p = parts(base);
  const naive = Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59);
  // Prva procjena s pomakom u trenutku `base`, pa jedna korekcija za DST.
  let ts = naive - zoneOffsetMs(base);
  ts = naive - zoneOffsetMs(new Date(ts));
  return new Date(ts).toISOString();
}

/**
 * `as_of` koji smije ići u sidro: pravo vrijeme retka (C1/C2) ili kraj dana
 * po Zagrebu kad vrijeme nije stvarno (C3/C4 ili nepoznato).
 */
export function resolveAnchorAsOf(
  iso: string | null | undefined,
  confidence: TimeConfidence | null | undefined,
  fallbackIso: string,
): string {
  if (!iso) return fallbackIso;
  if (hasRealTime(confidence)) return iso;
  return endOfZagrebDayIso(iso) ?? iso;
}
