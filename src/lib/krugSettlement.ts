/**
 * Krug Settlement — čisti helperi (bez React/supabase importova).
 *
 * Faza A: greedy netting + share calculators. Testabilno u izolaciji.
 * Algoritmi zrcale server-side RPC `krug_settlement_preview` — koriste se
 * primarno u testovima i za lokalne što-ako izračune u UI-u prije poziva RPC-a.
 */

export interface MemberNet {
  userId: string;
  net: number; // >0 = kredit (duguje mu se), <0 = dug
}

export interface Transfer {
  fromUser: string;
  toUser: string;
  amount: number;
}

/**
 * Greedy netting: sort po apsolutnom netu, spoji najvećeg dužnika s
 * najvećim vjerovnikom, ponavljaj do epsilon. Za N članova daje ≤ N−1
 * transfera. Deterministički (stabilan tie-break po userId).
 */
export function greedyNetting(nets: MemberNet[], epsilon = 0.01): Transfer[] {
  const debtors: { userId: string; amount: number }[] = [];
  const creditors: { userId: string; amount: number }[] = [];

  for (const n of nets) {
    if (n.net < -epsilon) debtors.push({ userId: n.userId, amount: -n.net });
    else if (n.net > epsilon) creditors.push({ userId: n.userId, amount: n.net });
  }

  debtors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
  creditors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

  const transfers: Transfer[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const amount = Math.round(Math.min(d.amount, c.amount) * 100) / 100;

    if (amount > epsilon) {
      transfers.push({ fromUser: d.userId, toUser: c.userId, amount });
    }

    d.amount -= amount;
    c.amount -= amount;

    if (d.amount <= epsilon) di++;
    if (c.amount <= epsilon) ci++;
  }

  return transfers;
}

export function computeEqualShares(memberIds: string[], amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (memberIds.length === 0) return out;
  const share = amount / memberIds.length;
  for (const id of memberIds) out[id] = share;
  return out;
}

/**
 * Proporcionalne udjele po `weights`. Ako suma weighta = 0 ili weight
 * nedostaje za nekog člana → fallback equal split. `weights` je mapa
 * `userId → weight (≥0)`.
 */
export function computeProportionalShares(
  memberIds: string[],
  weights: Record<string, number | null | undefined>,
  amount: number,
): Record<string, number> {
  if (memberIds.length === 0) return {};

  const effective: Record<string, number> = {};
  let sum = 0;
  let anyMissing = false;

  for (const id of memberIds) {
    const w = weights[id];
    if (w == null || Number.isNaN(w)) {
      anyMissing = true;
      effective[id] = 0;
    } else {
      effective[id] = w;
      sum += w;
    }
  }

  if (anyMissing || sum === 0) {
    return computeEqualShares(memberIds, amount);
  }

  const out: Record<string, number> = {};
  for (const id of memberIds) out[id] = (amount * effective[id]) / sum;
  return out;
}
