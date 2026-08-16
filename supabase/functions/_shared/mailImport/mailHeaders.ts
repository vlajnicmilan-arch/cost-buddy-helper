/**
 * MAIL UVOZ — signali autentičnosti iz SIROVIH zaglavlja poruke.
 *
 * ZAŠTO: Mailgun ne šalje uvijek polja `X-Mailgun-Spf` / `X-Mailgun-Dkim-Check-Result`
 * kao zasebna form polja; kod svih dosad primljenih poruka bila su prazna, pa je
 * svaka poruka završila kao T4 (bez signala). Sirova zaglavlja (`message-headers`)
 * ipak nose `Authentication-Results` s `dkim=pass header.d=…` i `spf=pass`.
 *
 * OPSEG UPOTREBE: ove signale koristi ISKLJUČIVO ograda Gmailove potvrde
 * prosljeđivanja (`googleAuthenticated`). Razina povjerenja (T1–T4) i dalje se
 * računa iz polja zapisanih pri prijemu — ovdje se ništa ne prepisuje.
 */

export interface RawAuthSignals {
  spf: string | null;
  dkim: string | null;
  arc: string | null;
  dmarc: string | null;
  originalAuthResults: string | null;
}

const EMPTY: RawAuthSignals = {
  spf: null,
  dkim: null,
  arc: null,
  dmarc: null,
  originalAuthResults: null,
};

/** Popis [ime, vrijednost] iz `message-headers` (Mailgun) ili iz ravnih polja. */
function headerPairs(raw: Record<string, unknown>): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'string') pairs.push([k.toLowerCase(), v]);
  }
  const rawHeaders = raw?.['message-headers'];
  if (typeof rawHeaders === 'string') {
    try {
      const parsed = JSON.parse(rawHeaders);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (Array.isArray(entry) && entry.length >= 2) {
            pairs.push([String(entry[0]).toLowerCase(), String(entry[1])]);
          }
        }
      }
    } catch {
      /* neispravan JSON zaglavlja se tiho preskače — nije razlog za pad obrade */
    }
  }
  return pairs;
}

const firstOf = (pairs: Array<[string, string]>, name: string): string | null => {
  const hit = pairs.find(([k, v]) => k === name && v.trim() !== '');
  return hit ? hit[1] : null;
};

/** Iz "mx.mailgun.org; dkim=pass header.d=google.com; spf=pass (…)" vadi jedan mehanizam. */
export function pickMechanism(authResults: string | null, mechanism: string): string | null {
  if (!authResults) return null;
  const re = new RegExp(`\\b${mechanism}\\s*=\\s*([a-z]+)([^;]*)`, 'i');
  const m = authResults.match(re);
  return m ? `${m[1]}${m[2] ?? ''}`.trim() : null;
}

export function extractAuthSignals(raw: Record<string, unknown> | null): RawAuthSignals {
  if (!raw) return EMPTY;
  const pairs = headerPairs(raw);
  const authResults = firstOf(pairs, 'authentication-results');
  const receivedSpf = firstOf(pairs, 'received-spf');

  return {
    spf: firstOf(pairs, 'x-mailgun-spf') ?? pickMechanism(authResults, 'spf') ?? receivedSpf,
    dkim: firstOf(pairs, 'x-mailgun-dkim-check-result') ?? pickMechanism(authResults, 'dkim'),
    arc: firstOf(pairs, 'x-mailgun-arc') ?? pickMechanism(authResults, 'arc'),
    dmarc: firstOf(pairs, 'x-mailgun-dmarc') ?? pickMechanism(authResults, 'dmarc'),
    originalAuthResults: authResults,
  };
}
