/**
 * Pure helpers for Family settlements netting (Faza 2).
 * Tested via familySettlements.test.ts.
 */

export interface MemberPosition {
  /** Member user id. */
  userId: string;
  /** Sum of shared expenses this member SHOULD have paid (their share). */
  owed: number;
  /** Sum of shared expenses this member ACTUALLY paid (from their wallet). */
  paid: number;
}

export interface Settlement {
  debtorUserId: string;
  creditorUserId: string;
  amount: number;
}

const EPS = 0.01; // cents

/**
 * Compute net settlements ("who owes whom") using greedy netting.
 *
 * Algorithm:
 *  1) For each member: net = paid - owed (positive → creditor, negative → debtor).
 *  2) Sort creditors desc, debtors asc (most negative first).
 *  3) Match biggest debtor with biggest creditor, emit one settlement at min(|d|, c).
 *  4) Repeat until all settled within EPS.
 *
 * Produces at most N-1 settlements for N members (vs N*(N-1)/2 pairwise).
 */
export function computeSettlements(positions: MemberPosition[]): Settlement[] {
  const nets = positions.map(p => ({
    userId: p.userId,
    net: round2(p.paid - p.owed),
  }));

  const creditors = nets
    .filter(n => n.net > EPS)
    .sort((a, b) => b.net - a.net);
  const debtors = nets
    .filter(n => n.net < -EPS)
    .map(n => ({ userId: n.userId, net: -n.net })) // store as positive debt
    .sort((a, b) => b.net - a.net);

  const settlements: Settlement[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.net, creditor.net));
    if (amount > EPS) {
      settlements.push({
        debtorUserId: debtor.userId,
        creditorUserId: creditor.userId,
        amount,
      });
    }
    debtor.net = round2(debtor.net - amount);
    creditor.net = round2(creditor.net - amount);
    if (debtor.net <= EPS) i++;
    if (creditor.net <= EPS) j++;
  }

  return settlements;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build a Croatian HUB-3 / "HR Pay" deep link / payment string.
 * Apps that recognize the `hub3://` scheme will open with fields prefilled.
 *
 * Format reference: HUB3 2D-barcode payload (single line, '|' separated).
 * We build the minimal-but-valid variant useful for deep-linking.
 *
 *  amount: in EUR (will be multiplied by 100 → integer cents)
 *  creditorName: receiver display name
 *  creditorIban: HR-format IBAN, no spaces
 *  reference: model + reference (e.g. "HR99 12345-6789") — optional
 *  description: free-text purpose (max 35 chars)
 */
export function buildHub3DeepLink(params: {
  amount: number;
  creditorName: string;
  creditorIban: string;
  reference?: string;
  description?: string;
}): string {
  const cents = Math.round(params.amount * 100);
  const iban = params.creditorIban.replace(/\s+/g, '').toUpperCase();
  const ref = params.reference?.replace(/\s+/g, '') || '';
  const desc = (params.description || '').slice(0, 35);

  const payload = [
    'HRVHUB30',
    'EUR',
    String(cents).padStart(15, '0'),
    '', // payer name (unknown)
    '', // payer address
    '', // payer city
    params.creditorName.slice(0, 25),
    '', // creditor address
    '', // creditor city
    iban,
    ref.slice(0, 2) || 'HR99',
    ref.slice(2) || '',
    'OTHR', // purpose code
    desc,
  ].join('\n');

  return `hub3://?payload=${encodeURIComponent(payload)}`;
}
