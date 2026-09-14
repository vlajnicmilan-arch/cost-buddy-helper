/**
 * GRUPIRANJE PO DOSEGU (Osobno / po tvrtki).
 *
 * Isti raspored koristi birač projekta i birač novčanika pri unosu troška:
 * korisnik uvijek vidi SVE svoje stavke, razvrstane po vlasništvu, bez obzira
 * na aktivni pogled. Grupiranje je čisto prikazno — ne dira atribuciju.
 */

export interface ScopedItem {
  business_profile_id?: string | null;
}

export interface ScopeGroup<T> {
  /** 'personal' ili id poslovnog profila. */
  key: string;
  label: string;
  items: T[];
}

/**
 * Prva grupa je uvijek osobna (ako ima stavki), zatim tvrtke abecedno.
 * Stavka čija tvrtka nije u popisu profila (npr. dijeljeni projekt) dobiva
 * vlastitu grupu s rezervnim nazivom.
 */
export const groupByBusinessScope = <T extends ScopedItem>(
  items: readonly T[],
  profiles: readonly { id: string; name: string }[],
  labels: { personal: string; unknownCompany: string },
): ScopeGroup<T>[] => {
  const nameById = new Map(profiles.map((p) => [p.id, p.name]));
  const personal: T[] = [];
  const byProfile = new Map<string, T[]>();

  for (const item of items) {
    const id = item.business_profile_id ?? null;
    if (!id) {
      personal.push(item);
      continue;
    }
    const bucket = byProfile.get(id);
    if (bucket) bucket.push(item);
    else byProfile.set(id, [item]);
  }

  const groups: ScopeGroup<T>[] = [];
  if (personal.length > 0) {
    groups.push({ key: 'personal', label: labels.personal, items: personal });
  }

  const companyGroups = Array.from(byProfile.entries()).map(([id, list]) => ({
    key: id,
    label: nameById.get(id) ?? labels.unknownCompany,
    items: list,
  }));
  companyGroups.sort((a, b) => a.label.localeCompare(b.label));

  return [...groups, ...companyGroups];
};
