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
export const BRIEF_FADE_MS = 550;

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
  /** Kasnjenje bloka akcija (ms). */
  actionsDelay: number;
  /** Ukupno trajanje do konacnog stanja (ms). */
  totalMs: number;
}

export function planChoreography({
  firstDaily,
  reducedMotion,
  calm,
  greetingText,
  lineTexts,
}: ChoreographyInput): ChoreographyPlan {
  const lines = lineTexts ?? [];

  if (!firstDaily || reducedMotion) {
    return {
      animated: false,
      fadeMs: BRIEF_FADE_MS,
      greetingDelay: 0,
      lineDelays: lines.map(() => 0),
      actionsDelay: 0,
      totalMs: 0,
    };
  }

  if (calm) {
    // Bez stepenice: pozdrav i rečenica u istom koraku, pa akcije.
    const step = `${greetingText} ${lines.join(' ')}`;
    const actionsDelay = BRIEF_FADE_MS + pauseAfter(step);
    return {
      animated: true,
      fadeMs: BRIEF_FADE_MS,
      greetingDelay: 0,
      lineDelays: lines.map(() => 0),
      actionsDelay,
      totalMs: actionsDelay + BRIEF_FADE_MS,
    };
  }

  let cursor = 0;
  let previousText = greetingText;
  const lineDelays: number[] = [];
  for (const text of lines) {
    cursor += BRIEF_FADE_MS + pauseAfter(previousText);
    lineDelays.push(cursor);
    previousText = text;
  }
  const actionsDelay = cursor + BRIEF_FADE_MS + pauseAfter(previousText);

  return {
    animated: true,
    fadeMs: BRIEF_FADE_MS,
    greetingDelay: 0,
    lineDelays,
    actionsDelay,
    totalMs: actionsDelay + BRIEF_FADE_MS,
  };
}
