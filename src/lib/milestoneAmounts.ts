/**
 * Korak A — vidljivost iznosa faze ovisi o ulozi.
 *
 * Baza (pogled `project_milestones_scoped`) vraća `NULL` za iznos koji uloga
 * ne smije vidjeti. Ovaj helper postoji zato da se skriveni iznos NIKAD ne
 * pretvori u 0 — 0 je legitimna vrijednost i lažira podatak.
 *
 * Pravilo:
 *   - `null` / `undefined` (skriveno)  -> ostaje `null`
 *   - nevaljan broj (NaN, prazan string) -> ostaje `null`
 *   - valjan broj -> Number
 */
export function readMilestoneAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True kad iznos nije vidljiv trenutnoj ulozi (nije isto što i 0). */
export function isAmountHidden(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}

/**
 * Zbroj koji preskače skrivene iznose. Skriveni iznos ne doprinosi zbroju
 * i NE računa se kao 0 — ako su svi skriveni, rezultat je `null`.
 */
export function sumVisibleAmounts(values: Array<number | null | undefined>): number | null {
  const visible = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (visible.length === 0) return null;
  return visible.reduce((sum, v) => sum + v, 0);
}

export interface MilestoneMargin {
  /** Postotak marže, zaokružen na cijeli broj. */
  pct: number;
  /** True kad je trošak veći ili jednak cijeni (faza u minusu / bez zarade). */
  isNegative: boolean;
}

/**
 * Korak B — živi izračun marže faze.
 *
 * Vraća `null` (redak se NE prikazuje) kad:
 *   - bilo koji iznos nije upisan / skriven je (`null`),
 *   - cijena nije veća od nule (nema dijeljenja s nulom ni besmislenog postotka).
 *
 * Trošak 0 je legitiman podatak (marža 100%), NIJE isto što i prazno.
 */
export function computeMilestoneMargin(
  cost: number | null | undefined,
  price: number | null | undefined,
): MilestoneMargin | null {
  if (cost === null || cost === undefined || price === null || price === undefined) return null;
  if (!Number.isFinite(cost) || !Number.isFinite(price)) return null;
  if (price <= 0) return null;
  const pct = Math.round(((price - cost) / price) * 100);
  return { pct, isNegative: cost >= price };
}

