/**
 * Faza 7 — pura logika za prikaz "izvora" faze koja je automatski
 * nastala iz odobrene odluke (modul "Odluke").
 *
 * ČISTO INFORMATIVNO: investor_price NIKAD ne ulazi ni u jedan
 * financijski zbroj (budžet troška, marža, prognoza, cashflow).
 * "Ugovoreno" je već povećano kroz zaseban aneks (project_contract_amendments)
 * koji stvara isti DB trigger.
 */

import type { ProjectMilestone } from '@/types/project';

export type MilestoneDecisionBadge =
  | { kind: 'none' }
  | { kind: 'from_decision'; decisionId: string; investorPrice: number | null }
  | { kind: 'from_annulled_decision'; decisionId: string; investorPrice: number | null };

/**
 * Vraća semantički status "izvora odluke" za jednu fazu.
 * - 'none'  — faza nije nastala iz odluke.
 * - 'from_decision'          — faza je iz aktivne (ne-poništene) odluke.
 * - 'from_annulled_decision' — izvorna odluka je naknadno poništena
 *   (obostranom potvrdom). Faza NAMJERNO ostaje — annul ne dira faze;
 *   samo se mijenja badge.
 */
export function getMilestoneDecisionBadge(m: Pick<ProjectMilestone,
  'source_decision_id' | 'source_decision' | 'investor_price'
>): MilestoneDecisionBadge {
  const id = m.source_decision_id ?? null;
  if (!id) return { kind: 'none' };
  const price = m.investor_price != null ? Number(m.investor_price) : null;
  const annulled = !!m.source_decision?.annulled_at;
  return {
    kind: annulled ? 'from_annulled_decision' : 'from_decision',
    decisionId: id,
    investorPrice: price,
  };
}
