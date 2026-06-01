/**
 * Pure helper: alocira PENDING family settlements (gdje je trenutni korisnik
 * dugovnik) u tjedne forecast horizonte. Settlement se "knjiži" u tjedan
 * koji sadrži `period_end`, ili u prvi tjedan horizonta ako je period_end već
 * prošao (today catch-up). Settlements u 'paid' / 'canceled' se ignoriraju.
 *
 * Bez I/O — fetch ide kroz hook.
 */

export interface SettlementForecastRow {
  debtor_user_id: string;
  amount: number;
  status: string;
  period_end: string; // ISO date
}

export interface ForecastWeekRange {
  start: Date;
  end: Date;
}

/**
 * Vraća niz iste dužine kao `weeks` s ukupnim iznosom obveza u svakom tjednu.
 */
export function computeFamilyOutflowsPerWeek(
  settlements: SettlementForecastRow[],
  currentUserId: string,
  weeks: ForecastWeekRange[],
): number[] {
  const out = new Array(weeks.length).fill(0);
  if (!currentUserId || weeks.length === 0) return out;

  const firstStart = weeks[0].start;
  const lastEnd = weeks[weeks.length - 1].end;

  for (const s of settlements) {
    if (s.status !== 'pending') continue;
    if (s.debtor_user_id !== currentUserId) continue;
    const amount = Number(s.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const due = new Date(s.period_end);
    if (Number.isNaN(due.getTime())) continue;

    // Past-due → first week (catch-up)
    let targetIdx = -1;
    if (due < firstStart) {
      targetIdx = 0;
    } else if (due > lastEnd) {
      continue; // beyond horizon
    } else {
      for (let i = 0; i < weeks.length; i++) {
        if (due >= weeks[i].start && due <= weeks[i].end) {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx >= 0) out[targetIdx] += amount;
  }

  return out;
}
