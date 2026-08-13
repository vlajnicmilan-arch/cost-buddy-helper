/**
 * Jedinstveni izvor istine za vezanje Krug polja na zapis troška.
 *
 * Pravilo (WS1/WS2): Krug je ISKLJUČIVO osobni kontekst. Odlučuje EFEKTIVNI
 * poslovni profil pod kojim se trošak sprema — uključujući profil dobiven
 * usmjeravanjem skena (OIB kupca / prihvaćena ponuda), ne samo aktivni kontekst.
 */
export interface KrugExpenseFields {
  krug_id: string | null;
  krug_privacy: 'personal' | 'shared' | null;
}

export const buildKrugFields = (
  targetBusinessProfileId: string | null | undefined,
  krugId: string | null | undefined,
  krugPrivacy: 'personal' | 'shared' | null | undefined,
): KrugExpenseFields => {
  if (targetBusinessProfileId) return { krug_id: null, krug_privacy: null };
  const id = krugId || null;
  return { krug_id: id, krug_privacy: id ? (krugPrivacy ?? null) : null };
};
