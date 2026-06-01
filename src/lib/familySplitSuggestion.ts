/**
 * Pure helper: analizira fairness trenutne podjele u family grupi i predlaže
 * prelazak na drugi `split_mode` ako su trenutni doprinosi izrazito neravnomjerni
 * u odnosu na strukturu prihoda/troška.
 *
 * Bez I/O. Snapshots se učitavaju u hooku iz `family_split_snapshots`.
 */

export type FamilySplitMode = 'equal' | 'proportional_income' | 'manual';

export interface SnapshotRow {
  member_user_id: string;
  period_start: string;
  period_end: string;
  shared_total: number;
  share_ratio: number;
  owed: number;
  paid: number;
}

export interface MemberRow {
  user_id: string;
  declared_monthly_income?: number | null;
  monthly_contribution?: number;
  income_share_consent?: boolean;
}

export interface FairnessResult {
  /** Trenutni mode grupe (echo). */
  currentMode: FamilySplitMode;
  /** Preporučeni mode, ili `null` ako prijedlog nije primjeren. */
  suggestedMode: FamilySplitMode | null;
  /** Stabilni razlog za prikaz / dismiss (npr. "income_skew_45"). */
  reason: string;
  /** Gini koeficijent neravnomjernosti stvarnog troška vs equal share (0–1). */
  gini: number;
  /** Broj perioda korištenih u analizi. */
  periodsAnalyzed: number;
  /** Broj članova s pozitivnim consentom (relevantno za proporcionalni mode). */
  consentingMembers: number;
}

const MIN_PERIODS = 3;
const SKEW_THRESHOLD = 0.25; // 25% odstupanje od equal share

/**
 * Gini koeficijent serije pozitivnih brojeva (0 = potpuno jednako, 1 = svi u jednom).
 * Robusno za prazne / male serije.
 */
export function gini(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (xs.length === 0) return 0;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}

/**
 * Glavna analiza fairnessa. Vraća prijedlog ili `null` ako trenutni mode već
 * djeluje pošteno / podataka je premalo / nema dovoljno consentiranih članova
 * za proporcionalni mode.
 */
export function analyzeFairness(
  snapshots: SnapshotRow[],
  members: MemberRow[],
  currentMode: FamilySplitMode,
): FairnessResult {
  const consenting = members.filter((m) => m.income_share_consent).length;

  // Agregiraj `owed` po članu kroz sve dostupne periode
  const owedByMember = new Map<string, number>();
  const periodsSet = new Set<string>();
  for (const s of snapshots) {
    periodsSet.add(`${s.period_start}|${s.period_end}`);
    owedByMember.set(
      s.member_user_id,
      (owedByMember.get(s.member_user_id) ?? 0) + Number(s.owed || 0),
    );
  }
  const periodsAnalyzed = periodsSet.size;

  // Stabilni base result — popunit ćemo suggestedMode/reason niže
  const base: FairnessResult = {
    currentMode,
    suggestedMode: null,
    reason: 'ok',
    gini: 0,
    periodsAnalyzed,
    consentingMembers: consenting,
  };

  // Nedovoljno podataka
  if (periodsAnalyzed < MIN_PERIODS) {
    return { ...base, reason: 'insufficient_periods' };
  }

  // Edge: 0–1 član — split nema smisla
  const memberCount = members.length;
  if (memberCount < 2) {
    return { ...base, reason: 'single_member' };
  }

  // Već je manual — ne diramo, korisnik je svjesno odabrao
  if (currentMode === 'manual') {
    return { ...base, reason: 'manual_mode' };
  }

  // Izračunaj skew u stvarnom doprinosu (owed) vs equal share
  const owedValues: number[] = [];
  for (const m of members) owedValues.push(owedByMember.get(m.user_id) ?? 0);
  const totalOwed = owedValues.reduce((a, b) => a + b, 0);
  if (totalOwed === 0) {
    return { ...base, reason: 'zero_activity' };
  }

  const equalShare = totalOwed / memberCount;
  const maxDeviation = Math.max(
    ...owedValues.map((v) => Math.abs(v - equalShare) / equalShare),
  );
  const giniIdx = gini(owedValues);

  // Currently equal mode and skew > threshold → predlaži proporcionalni
  if (currentMode === 'equal' && maxDeviation > SKEW_THRESHOLD) {
    if (consenting >= 2) {
      return {
        ...base,
        suggestedMode: 'proportional_income',
        reason: `income_skew_${Math.round(maxDeviation * 100)}`,
        gini: giniIdx,
      };
    }
    return {
      ...base,
      reason: 'needs_consent',
      gini: giniIdx,
    };
  }

  // Currently proportional ali skew je nestao (svi otprilike jednako troše) →
  // predlaži povratak na equal radi jednostavnosti
  if (currentMode === 'proportional_income' && maxDeviation < SKEW_THRESHOLD / 2) {
    return {
      ...base,
      suggestedMode: 'equal',
      reason: 'spend_balanced',
      gini: giniIdx,
    };
  }

  return { ...base, gini: giniIdx };
}
