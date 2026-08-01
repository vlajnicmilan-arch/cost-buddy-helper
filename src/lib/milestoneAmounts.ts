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


export interface MilestoneAmountsLine {
  /** i18n ključ retka. */
  key:
    | 'projects.milestoneAmounts.listLine'
    | 'projects.milestoneAmounts.listLineCostOnly'
    | 'projects.milestoneAmounts.listLinePriceOnly';
  /** Sirovi iznosi za formatiranje u komponenti (formatAmount). */
  cost: number | null;
  price: number | null;
}

/**
 * Korak B — jedinstveni izvor logike za redak s iznosima u popisu faza
 * (lista i kanban koriste isti helper, logika se ne piše dvaput).
 *
 * Četiri slučaja:
 *   - oba iznosa  -> `listLine`           ("Trošak X · Investitoru Y")
 *   - samo trošak -> `listLineCostOnly`   ("Trošak X")
 *   - samo cijena -> `listLinePriceOnly`  ("Investitoru Y")
 *   - nijedan     -> `null`               (retka nema)
 *
 * Iznos se smatra prikazivim kad je konačan broj veći od nule; `null`
 * (nije upisano ILI skriveno za ulogu) i 0 ne daju redak sami za sebe.
 *
 * NAPOMENA: traka potrošnje ovisi ISKLJUČIVO o trošku i nije dio ovog helpera.
 */
export function buildMilestoneAmountsLine(
  cost: number | null | undefined,
  price: number | null | undefined,
): MilestoneAmountsLine | null {
  const c = typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : null;
  const p = typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
  if (c !== null && p !== null) return { key: 'projects.milestoneAmounts.listLine', cost: c, price: p };
  if (c !== null) return { key: 'projects.milestoneAmounts.listLineCostOnly', cost: c, price: null };
  if (p !== null) return { key: 'projects.milestoneAmounts.listLinePriceOnly', cost: null, price: p };
  return null;
}

/**
 * Vidljivost polja s iznosima faze ovisi o ULOZI, nikad o vrijednosti.
 * `null` iznos ne razlikuje „skriveno za ulogu" od „još nije upisano", pa se
 * prikaz polja NE smije izvoditi iz podatka.
 *
 *   - trošak (`budget`)          → vlasnik, viewer, member
 *   - cijena (`investor_price`)  → vlasnik, viewer, investor
 *   - worker                     → nijedan iznos
 */
export type MilestoneAmountRole = 'owner' | 'member' | 'worker' | 'viewer' | 'investor';

export function canSeeMilestoneCostField(
  role: MilestoneAmountRole | null | undefined,
  isOwner = false,
): boolean {
  if (isOwner) return true;
  return role === 'owner' || role === 'viewer' || role === 'member';
}

export function canSeeMilestonePriceField(
  role: MilestoneAmountRole | null | undefined,
  isOwner = false,
): boolean {
  if (isOwner) return true;
  return role === 'owner' || role === 'viewer' || role === 'investor';
}
