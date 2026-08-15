/**
 * BRIEF-VRATA V1 — tipovi i registar kategorija.
 *
 * V1 IZVRSAVA samo tri kategorije. Buduci tipovi su ovdje deklarirani
 * (registar), ali su TVRDO ISKLJUCENI: motor ih nikad ne obraduje jer nisu u
 * `BRIEF_CATEGORY_PRIORITY`. Kad izvor cinjenica bude postojao, kategorija se
 * doda u prioritet i u prevode — bez ikakve promjene motora.
 */

/** Aktivne kategorije u V1. */
export type BriefCategoryId = 'uncertainty' | 'due' | 'mail';

/** Registrirane, ali NEIZVRSNE kategorije (nema izvora cinjenica). */
export type FutureBriefCategoryId = 'liquidity' | 'projectBudget';

export const BRIEF_FUTURE_CATEGORIES: Record<FutureBriefCategoryId, { enabled: false; note: string }> = {
  liquidity: { enabled: false, note: 'Likvidnost 14 dana — izvor cinjenica jos ne postoji.' },
  projectBudget: { enabled: false, note: 'Projektni budzet — izvor cinjenica jos ne postoji.' },
};

/** Fiksni prioritet. Redoslijed je ugovor, ne preporuka. */
export const BRIEF_CATEGORY_PRIORITY: readonly BriefCategoryId[] = ['uncertainty', 'due', 'mail'];

/** Najveci broj poruka koje vrata smiju prikazati. */
export const BRIEF_MAX_MESSAGES = 3;

/** Parametri navigacije kojima se otvara tocno taj skup stavki. */
export interface BriefFilterTarget {
  path: string;
  [param: string]: string | number | boolean;
}

export interface BriefCategoryFacts {
  count: number;
  /** Najnoviji created_at medu stavkama (ISO) ili null. */
  watermark: string | null;
  /** Dokaziva destinacija. Bez nje se poruka NE prikazuje. */
  filter: BriefFilterTarget | null;
  /** Samo DOSPIJECE. */
  nextDue?: string | null;
  issuer?: string | null;
}

export interface BriefSnapshot {
  enabled: boolean;
  /** Djelomicno je dopusteno: kategorija koja nije stigla jednostavno nedostaje. */
  categories?: Partial<Record<BriefCategoryId, BriefCategoryFacts>>;
}

export type BriefCategoryState = 'new' | 'reminder' | 'unchanged' | 'resolved';

/** Stanje cinjenice pri ZADNJEM STVARNOM PRIKAZU vrata (po uredaju). */
export interface BriefContinuityEntry {
  count: number;
  watermark: string | null;
  shownAt: string;
}

export type BriefContinuity = Partial<Record<BriefCategoryId, BriefContinuityEntry>>;

export interface BriefMessage {
  /** 'calm' je fallback stanje, ne kategorija. */
  category: BriefCategoryId | 'calm';
  state: BriefCategoryState | 'calm';
  textKey: string;
  textParams: { count?: number; issuer?: string; dueDate?: string | null };
  actionKey: string;
  /** null samo za MIRNO (ono ne tvrdi nista o skupu stavki). */
  target: BriefFilterTarget | null;
}
