/**
 * Krug — automatsko izjednačavanje postotaka podjele troška.
 *
 * Jedini izvor istine za ponašanje forme "ručna podjela": kad korisnik
 * uredi jedno polje, ostatak do 100 se razmjerno raspodijeli po NEDIRNUTIM
 * poljima, a zbroj je uvijek točno 100.00 (zadnje nedirnuto polje apsorbira
 * lom zaokruživanja).
 *
 * Pravila:
 * - dirnuta (touched) polja se NIKAD ne prepisuju,
 * - ako dirnuta polja sama premaše 100 → `error: 'touched_over_100'`,
 * - ako nema nedirnutih polja, vrijednosti ostaju kakve jesu (server je
 *   zadnja brana za zbroj != 100),
 * - ako je dotadašnji zbroj nedirnutih 0 → ostatak se dijeli jednako.
 */

export type SplitValues = Record<string, number>;

export interface RebalanceResult {
  values: SplitValues;
  error: 'touched_over_100' | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function rebalanceShares(
  current: SplitValues,
  memberIds: string[],
  touchedIds: Iterable<string>,
): RebalanceResult {
  const touched = new Set(touchedIds);
  const values: SplitValues = {};
  for (const id of memberIds) values[id] = round2(Number(current[id] ?? 0) || 0);

  const touchedList = memberIds.filter((id) => touched.has(id));
  const untouched = memberIds.filter((id) => !touched.has(id));

  const touchedSum = round2(touchedList.reduce((a, id) => a + values[id], 0));

  if (touchedSum > 100 + 1e-9) {
    return { values, error: 'touched_over_100' };
  }
  if (untouched.length === 0) {
    return { values, error: null };
  }

  const remaining = round2(100 - touchedSum);
  const prevSum = untouched.reduce((a, id) => a + values[id], 0);

  let allocated = 0;
  untouched.forEach((id, idx) => {
    const isLast = idx === untouched.length - 1;
    if (isLast) {
      values[id] = round2(remaining - allocated);
      return;
    }
    const share = prevSum > 0 ? values[id] / prevSum : 1 / untouched.length;
    const v = round2(remaining * share);
    values[id] = v;
    allocated = round2(allocated + v);
  });

  return { values, error: null };
}

/** Formatira vrijednost za <Input type="number"> bez suvišnih nula. */
export function formatShare(n: number): string {
  return String(round2(n));
}
