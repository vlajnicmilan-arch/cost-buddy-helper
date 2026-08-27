/**
 * What silently disappears from sight when a project is deleted.
 *
 * "Ljudi" and "Suradnici" never list deleted projects, so an unpaid debt
 * towards a person vanishes from their card. This helper only produces the
 * numbers for the warning — deletion behaviour is unchanged.
 */

export interface ProjectWorkerDebtFact {
  /** project_workers.id */
  engagementId: string;
  earned: number;
  paid: number;
}

export interface ProjectCollaboratorDebtFact {
  collaboratorId: string;
  /** total_price; 0 means "not entered". */
  agreed: number;
  paid: number;
  status?: string | null;
}

export interface ProjectDeleteImpact {
  workerCount: number;
  workerUnpaid: number;
  collaboratorCount: number;
  collaboratorUnpaid: number;
  /** true when any money is still owed to a person. */
  hasDebt: boolean;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function summarizeProjectDeleteImpact(
  workers: readonly ProjectWorkerDebtFact[],
  collaborators: readonly ProjectCollaboratorDebtFact[],
): ProjectDeleteImpact {
  let workerUnpaid = 0;
  for (const w of workers) {
    workerUnpaid += Math.max(0, (Number(w.earned) || 0) - (Number(w.paid) || 0));
  }

  const activeCollaborators = collaborators.filter((c) => c.status !== 'cancelled');
  let collaboratorUnpaid = 0;
  for (const c of activeCollaborators) {
    const agreed = Number(c.agreed) || 0;
    if (agreed <= 0) continue; // amount was never entered — nothing to claim
    collaboratorUnpaid += Math.max(0, agreed - (Number(c.paid) || 0));
  }

  const wu = round2(workerUnpaid);
  const cu = round2(collaboratorUnpaid);
  return {
    workerCount: workers.length,
    workerUnpaid: wu,
    collaboratorCount: activeCollaborators.length,
    collaboratorUnpaid: cu,
    hasDebt: wu > 0.005 || cu > 0.005,
  };
}
