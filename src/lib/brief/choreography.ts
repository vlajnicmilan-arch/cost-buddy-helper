/**
 * BRIEF-VRATA — koreografija pojavljivanja.
 *
 * Zeljezno pravilo: NULA POMICANJA. Geometrija je rezervirana od prvog framea,
 * animira se iskljucivo prozirnost. Ovaj modul odreduje SAMO kada koji korak
 * postaje vidljiv (u ms od prikaza) i koliko traje njegov fade-in.
 *
 * Ritam: razmak izmedu dva pojavljivanja = TRAJANJE FADE-INA + PAUZA.
 * Pauza pocinje tek kad prethodni fade-in zavrsi i ovisi o duljini recenice
 * koja se upravo pojavila (deterministicki, bez AI-ja).
 */

/** Trajanje pojedinog fade-ina (svi elementi). */
export const BRIEF_FADE_MS = 750;

/**
 * Pauza koja se primjenjuje ISKLJUCIVO izmedu dvije akcije.
 * Akcija se gleda, ne cita — zato ne vrijedi pravilo po duljini teksta.
 */
export const BRIEF_ACTION_PAUSE_MS = 500;

/** Osnovica pauze nakon zavrsenog fade-ina. */
export const BRIEF_PAUSE_BASE_MS = 750;

/** Dodatak pauzi po rijeci upravo prikazane recenice. */
export const BRIEF_PAUSE_PER_WORD_MS = 45;

/** Donja granica pauze. */
export const BRIEF_PAUSE_MIN_MS = 750;

/** Gornja granica pauze. */
export const BRIEF_PAUSE_MAX_MS = 1600;

/** Broj rijeci nad razrijesenim tekstom (ne nad i18n kljucem). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** pauza = clamp(base + perWord * brojRijeci, min, max) */
export function pauseAfter(text: string): number {
  const raw = BRIEF_PAUSE_BASE_MS + BRIEF_PAUSE_PER_WORD_MS * countWords(text);
  return Math.min(BRIEF_PAUSE_MAX_MS, Math.max(BRIEF_PAUSE_MIN_MS, raw));
}

export interface ChoreographyInput {
  /** Prvi dnevni ulazak — jedino stanje u kojem koreografija postoji. */
  firstDaily: boolean;
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean;
  /** Tiho stanje: pozdrav i rečenica dolaze ZAJEDNO. */
  calm: boolean;
  /** Razrijeseni tekst pozdrava. */
  greetingText: string;
  /** Razrijeseni tekstovi redaka poruka (bez pozdrava, bez akcija). */
  lineTexts: string[];
  /** Postoji li akcija "Pogledaj" (dokaziva destinacija). */
  hasPrimaryAction?: boolean;
}

export interface ChoreographyPlan {
  /** Je li koreografija uopce aktivna. */
  animated: boolean;
  /** Trajanje fade-ina za sve elemente (ms). */
  fadeMs: number;
  /** Kasnjenje pozdrava (ms). */
  greetingDelay: number;
  /** Kasnjenja pojedinih redaka poruka (ms). */
  lineDelays: number[];
  /** Kasnjenje prvog koraka akcija (ms) — "Pogledaj", ili "Udi" ako Pogledaj nema. */
  actionsDelay: number;
  /** Kasnjenje akcije "Pogledaj" (ms); null kad je nema. */
  primaryActionDelay: number | null;
  /** Kasnjenje akcije "Udi u Centar" (ms). */
  enterActionDelay: number;
  /** Ukupno trajanje do konacnog stanja (ms). */
  totalMs: number;
}

export function planChoreography({
  firstDaily,
  reducedMotion,
  calm,
  greetingText,
  lineTexts,
  hasPrimaryAction = false,
}: ChoreographyInput): ChoreographyPlan {
  const lines = lineTexts ?? [];

  if (!firstDaily || reducedMotion) {
    return {
      animated: false,
      fadeMs: BRIEF_FADE_MS,
      greetingDelay: 0,
      lineDelays: lines.map(() => 0),
      actionsDelay: 0,
      primaryActionDelay: hasPrimaryAction ? 0 : null,
      enterActionDelay: 0,
      totalMs: 0,
    };
  }

  const finish = (actionsDelay: number, lineDelays: number[]): ChoreographyPlan => {
    // Prvi korak akcija dolazi prema zadnjoj recenici; druga akcija tek nakon prve,
    // po vlastitom pravilu (fade + BRIEF_ACTION_PAUSE_MS), nikad po duljini teksta.
    const primaryActionDelay = hasPrimaryAction ? actionsDelay : null;
    const enterActionDelay = hasPrimaryAction
      ? actionsDelay + BRIEF_FADE_MS + BRIEF_ACTION_PAUSE_MS
      : actionsDelay;
    return {
      animated: true,
      fadeMs: BRIEF_FADE_MS,
      greetingDelay: 0,
      lineDelays,
      actionsDelay,
      primaryActionDelay,
      enterActionDelay,
      totalMs: enterActionDelay + BRIEF_FADE_MS,
    };
  };

  if (calm) {
    // Bez stepenice: pozdrav i rečenica u istom koraku, pa akcije.
    const step = `${greetingText} ${lines.join(' ')}`;
    return finish(BRIEF_FADE_MS + pauseAfter(step), lines.map(() => 0));
  }

  let cursor = 0;
  let previousText = greetingText;
  const lineDelays: number[] = [];
  for (const text of lines) {
    cursor += BRIEF_FADE_MS + pauseAfter(previousText);
    lineDelays.push(cursor);
    previousText = text;
  }

  return finish(cursor + BRIEF_FADE_MS + pauseAfter(previousText), lineDelays);
}
