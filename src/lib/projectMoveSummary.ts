/**
 * SAŽETAK PREMJEŠTANJA PROJEKTA (osobno ↔ tvrtka).
 *
 * Čista funkcija: iz troškova projekta i popisa SVIH korisnikovih novčanika
 * gradi pregled koji korisnik vidi PRIJE potvrde.
 *
 * Pravilo: premještanje NE MIJENJA stanje nijednog novčanika — novac je već
 * otišao iz novčanika iz kojeg je plaćeno. Mijenja se samo u kojem se pregledu
 * (osobno / tvrtka) trošak broji. Zato sažetak izričito označava novčanike
 * koji pripadaju drugoj strani (`isCrossScope`).
 */

export interface MoveSummaryExpense {
  amount: number | null;
  payment_source: string | null;
  expense_nature?: string | null;
  deleted_at?: string | null;
}

export interface MoveSummarySource {
  id: string;
  name: string;
  business_profile_id: string | null;
}

export interface MoveSummaryLine {
  /** `custom:<uuid>` ili ugrađeni ključ (npr. `cash`) */
  key: string;
  name: string;
  count: number;
  total: number;
  /** Novčanik pripada drugoj strani od odredišta premještanja. */
  isCrossScope: boolean;
  /** Doseg novčanika: osobni ili poslovni. */
  scope: 'personal' | 'business';
}

export interface MoveSummary {
  count: number;
  total: number;
  lines: MoveSummaryLine[];
  hasCrossScope: boolean;
}

const customId = (paymentSource: string | null): string | null => {
  if (!paymentSource) return null;
  if (paymentSource.startsWith('custom:')) return paymentSource.slice('custom:'.length);
  return null;
};

/**
 * @param targetBusinessProfileId odredište premještanja: id tvrtke ili `null` (osobno)
 */
export const buildMoveSummary = (
  expenses: MoveSummaryExpense[],
  sources: MoveSummarySource[],
  targetBusinessProfileId: string | null,
  fallbackName = 'Gotovina',
): MoveSummary => {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const lines = new Map<string, MoveSummaryLine>();
  let count = 0;
  let total = 0;

  for (const e of expenses) {
    if (e.deleted_at) continue;
    if (e.expense_nature === 'correction') continue;
    const amount = Number(e.amount ?? 0);
    count += 1;
    total += amount;

    const key = e.payment_source || 'cash';
    const uuid = customId(key);
    const source = uuid ? byId.get(uuid) : undefined;
    const scope: 'personal' | 'business' = source
      ? source.business_profile_id
        ? 'business'
        : 'personal'
      : 'personal';
    const isCrossScope = source
      ? (source.business_profile_id ?? null) !== (targetBusinessProfileId ?? null)
      : targetBusinessProfileId !== null;

    const existing = lines.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += amount;
    } else {
      lines.set(key, {
        key,
        name: source?.name ?? fallbackName,
        count: 1,
        total: amount,
        isCrossScope,
        scope,
      });
    }
  }

  const out = [...lines.values()].sort((a, b) => b.total - a.total);
  return {
    count,
    total: Number(total.toFixed(2)),
    lines: out,
    hasCrossScope: out.some((l) => l.isCrossScope),
  };
};
