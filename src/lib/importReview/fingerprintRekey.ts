/**
 * PRIJELAZ NA KLJUČ UVOZA V2 (`imp2:`) — čista odluka, bez mreže.
 *
 * Svaki redak izvoda ima do dva identiteta:
 *  - V2 ključ (`imp2:`) — datum, iznos, saldo (ili stabilan `ord:N`); bez
 *    AI-teksta, pa isti izvod pročitan dvaput daje isti ključ;
 *  - stari otisak (`imp:`) — sadrži ime trgovca/opis, pa je nestabilan.
 *
 * Pravilo prijelaza: traži se OBOJE. Nađe li se redak samo po starom ključu,
 * tom se retku NOVI ključ UPISUJE (rekey) — nikad se ne stvara novi redak.
 * Redak bez dokazivog V2 ključa (`null`) ostaje na starom otisku.
 */

export interface RekeyPlanInput {
  /** V2 ključ po retku; `null` kad redoslijed nije dokaziv. */
  readonly keysV2: readonly (string | null)[];
  /** Stari otisak po retku (uvijek postoji). */
  readonly legacyKeys: readonly string[];
  /** Ključevi koji u knjigama postoje kao živi redci. */
  readonly live: ReadonlySet<string>;
  /** Ključevi koji postoje kao soft-obrisani redci. */
  readonly deleted: ReadonlySet<string>;
}

export interface RekeyPair {
  readonly old: string;
  readonly new: string;
}

export interface RekeyPlan {
  /** Parovi za `rekey_import_fingerprints`. */
  readonly pairs: RekeyPair[];
  /** Djelotvoran otisak po retku — ono što ide u pregled i u knjige. */
  readonly fingerprints: string[];
  /** Stanja nakon rekeya (novi ključ nasljeđuje stanje starog). */
  readonly live: Set<string>;
  readonly deleted: Set<string>;
}

export function planFingerprintRekey(input: RekeyPlanInput): RekeyPlan {
  const live = new Set(input.live);
  const deleted = new Set(input.deleted);
  const pairs: RekeyPair[] = [];
  const seenPairs = new Set<string>();

  const fingerprints = input.keysV2.map((v2, i) => {
    const legacy = input.legacyKeys[i];
    // Bez dokazivog V2 ključa redak ostaje na starom otisku.
    if (!v2) return legacy;
    // Redak je već na novom ključu.
    if (live.has(v2) || deleted.has(v2)) return v2;

    const legacyLive = live.has(legacy);
    const legacyDeleted = deleted.has(legacy);
    if (legacyLive || legacyDeleted) {
      if (!seenPairs.has(legacy)) {
        seenPairs.add(legacy);
        pairs.push({ old: legacy, new: v2 });
      }
      // Novi ključ preuzima stanje starog; stari se više ne koristi.
      if (legacyLive) { live.add(v2); live.delete(legacy); }
      if (legacyDeleted) { deleted.add(v2); deleted.delete(legacy); }
      return v2;
    }
    // Retka nema ni pod jednim ključem — novi redak dobiva V2 ključ.
    return v2;
  });

  return { pairs, fingerprints, live, deleted };
}
