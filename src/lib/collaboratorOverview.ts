/**
 * Pure helpers for the "Suradnici" (collaborator) cross-project overview.
 *
 * Read-only aggregation over `project_collaborators` ONLY. Hourly work
 * (project_workers, workers, work entries, payouts, rate history) is a
 * different model and must never be joined or summed together with this one.
 *
 * Data facts this module encodes:
 *  - `total_price === 0` means NOT ENTERED, not "zero agreed".
 *  - there is no payment ledger for collaborators; `paid_amount` is a running
 *    total without history, so no payment list and no payment action exist.
 */

export interface CollaboratorRow {
  id: string;
  project_id: string;
  first_name: string;
  last_name: string;
  company_name?: string | null;
  service_description?: string | null;
  total_price: number;
  paid_amount: number;
  /** Hand-typed pre-ledger amount; part of paid_amount, never changed. */
  legacy_paid_amount?: number;
  status: string;
  business_profile_id?: string | null;
}

export interface CollaboratorEngagement {
  id: string;
  projectId: string;
  projectName: string;
  serviceDescription: string;
  status: string;
  /** null when the amount was never entered (total_price === 0). */
  agreed: number | null;
  paid: number;
  legacyPaid: number;
  isCancelled: boolean;
}

export interface CollaboratorGroup {
  key: string;
  displayName: string;
  isCompany: boolean;
  engagements: CollaboratorEngagement[];
  /** Sum of entered amounts, cancelled engagements excluded. */
  agreed: number;
  paid: number;
  remaining: number;
  /** true when at least one non-cancelled engagement has no amount entered. */
  hasUnpriced: boolean;
}

/** Lowercase, diacritics-stripped, whitespace-collapsed name key. */
export function normalizeCollaboratorName(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const displayNameOf = (row: CollaboratorRow): { name: string; isCompany: boolean } => {
  const company = (row.company_name ?? '').trim();
  if (company) return { name: company, isCompany: true };
  return { name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.replace(/\s+/g, ' ').trim(), isCompany: false };
};

/**
 * Group collaborator engagements into one entry per (business profile, name).
 * Cancelled engagements are listed but never summed.
 */
export function groupCollaborators(
  rows: readonly CollaboratorRow[],
  projectNames: Record<string, string> = {},
): CollaboratorGroup[] {
  const map = new Map<string, CollaboratorGroup>();

  for (const row of rows) {
    const { name, isCompany } = displayNameOf(row);
    const key = `${row.business_profile_id ?? 'personal'}|${normalizeCollaboratorName(name)}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        displayName: name,
        isCompany,
        engagements: [],
        agreed: 0,
        paid: 0,
        remaining: 0,
        hasUnpriced: false,
      };
      map.set(key, group);
    }

    const total = Number(row.total_price) || 0;
    const agreed = total === 0 ? null : total;
    const paid = Number(row.paid_amount) || 0;
    const isCancelled = row.status === 'cancelled';

    group.engagements.push({
      id: row.id,
      projectId: row.project_id,
      projectName: projectNames[row.project_id] ?? '',
      serviceDescription: (row.service_description ?? '').trim(),
      status: row.status,
      agreed,
      paid,
      legacyPaid: Number(row.legacy_paid_amount) || 0,
      isCancelled,
    });

    if (isCancelled) continue;
    if (agreed === null) group.hasUnpriced = true;
    else group.agreed = round2(group.agreed + agreed);
    group.paid = round2(group.paid + paid);
  }

  const out = [...map.values()];
  for (const g of out) g.remaining = round2(Math.max(0, g.agreed - g.paid));
  return out;
}

/** Highest outstanding first, then by name (hr locale). */
export function sortCollaboratorRows(groups: readonly CollaboratorGroup[]): CollaboratorGroup[] {
  return [...groups].sort(
    (a, b) => b.remaining - a.remaining || a.displayName.localeCompare(b.displayName, 'hr'),
  );
}
