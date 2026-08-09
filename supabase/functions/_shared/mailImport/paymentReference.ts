/**
 * MAIL UVOZ — ŠIFRA OBRAČUNSKOG MJESTA (ključ pamćenja izdavatelja i mjesta).
 *
 * SVJESTAN REZ (nalog 09.08.2026.): ovdje živi SAMO **primarno pravilo** —
 * ključem-sidrena šifra. Traži se oznaka („šifra kupca", „broj kupca",
 * „obračunsko mjesto", „mjerno mjesto", „korisnički broj" i sinonimi) pa se
 * uzima broj iz TOG retka. Točno jedan različit kandidat = uzmi; više = prazno.
 *
 * SEKUNDARNO pravilo (stabilni prefiks poziva na broj potvrđen drugim računom
 * istog izdavatelja) SE NAMJERNO NE GRADI. Dodaje se tek kad se pojavi stvaran
 * izdavatelj bez ključem-sidrene šifre — bez primjera bi to bilo nagađanje.
 *
 * Bez šifre → `placeCode === ''` → pamćenje smije dati SAMO OIB/naziv, NIKAD
 * oznaku mjesta (brana: Solin ne smije dobiti Splitovu oznaku).
 *
 * Modul je čist (bez mreže, bez Deno/DOM) — re-exporta se u `src`.
 */

/** Provenijencija ostaje u vrijednosti: `sk:12345`, `om:900123`, `mm:77`. */
type Anchor = { tag: 'sk' | 'om' | 'mm'; re: RegExp };

const ANCHORS: Anchor[] = [
  // Šifra/broj kupca, korisnički broj, šifra platitelja, partner/customer no.
  {
    tag: 'sk',
    re:
      /(?:[sš]ifra\s+(?:kupca|platitelja|korisnika|potro[sš]a[cč]a)|broj\s+(?:kupca|korisnika|potro[sš]a[cč]a|partnera)|korisni[cč]ki\s+broj|customer\s+(?:number|no\.?|id)|account\s+(?:number|no\.?))/i,
  },
  // Obračunsko mjesto.
  { tag: 'om', re: /(?:[sš]ifra\s+)?obra[cč]unsk\w*\s+mjest\w*/i },
  // Mjerno mjesto / mjerilo.
  { tag: 'mm', re: /(?:[sš]ifra\s+)?mjern\w*\s+mjest\w*/i },
];

/** Broj iza oznake u istom retku — najmanje 3 znamenke, dopušteni razmaci/crtice. */
const VALUE_RE = /([0-9][0-9\s\-\/]{2,})/;

const normalizeDigits = (raw: string): string => raw.replace(/[^0-9]/g, '');

export interface PlaceCodePick {
  /** `sk:12345` / `om:900123` / `mm:77`, ili `''` kad nema jednoznačne šifre. */
  placeCode: string;
  /** Više različitih kandidata — ne tvrdimo ništa. */
  ambiguous: boolean;
  candidates: string[];
}

/**
 * Ključem-sidrena šifra obračunskog mjesta iz slobodnog teksta računa.
 * Nema oznake ili ima više različitih vrijednosti = prazno.
 */
export function findPlaceCode(text: string | null | undefined): PlaceCodePick {
  const found = new Set<string>();
  for (const line of (text ?? '').split(/\r?\n/)) {
    for (const anchor of ANCHORS) {
      const hit = anchor.re.exec(line);
      if (!hit) continue;
      const rest = line.slice(hit.index + hit[0].length);
      const value = VALUE_RE.exec(rest);
      if (!value) continue;
      const digits = normalizeDigits(value[1]);
      if (digits.length < 3) continue;
      found.add(`${anchor.tag}:${digits}`);
    }
  }
  const candidates = [...found];
  if (candidates.length === 1) return { placeCode: candidates[0], ambiguous: false, candidates };
  return { placeCode: '', ambiguous: candidates.length > 1, candidates };
}

export const PLACE_CODE_AMBIGUOUS_WARNING = 'vise_kandidata_sifra_mjesta';
