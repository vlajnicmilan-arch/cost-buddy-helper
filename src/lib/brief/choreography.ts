/**
 * BRIEF-VRATA — koreografija pojavljivanja.
 *
 * Zeljezno pravilo: NULA POMICANJA. Geometrija je rezervirana od prvog framea,
 * animira se iskljucivo prozirnost. Ovaj modul odreduje SAMO kada koji korak
 * postaje vidljiv (u ms od prikaza).
 */

/** Trajanje pojedinog fade-ina. */
export const BRIEF_FADE_MS = 320;

/** Razmak izmedu pojavljivanja dva koraka. */
export const BRIEF_STEP_GAP_MS = 800;

export interface ChoreographyInput {
  /** Prvi dnevni ulazak — jedino stanje u kojem koreografija postoji. */
  firstDaily: boolean;
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean;
  /** Tiho stanje: pozdrav i rečenica dolaze ZAJEDNO. */
  calm: boolean;
  /** Broj tekstualnih redaka poruka (bez pozdrava, bez akcija). */
  lineCount: number;
}

export interface ChoreographyPlan {
  /** Je li koreografija uopce aktivna. */
  animated: boolean;
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
  lineCount,
}: ChoreographyInput): ChoreographyPlan {
  const lines = Math.max(0, lineCount);
  if (!firstDaily || reducedMotion) {
    return {
      animated: false,
      greetingDelay: 0,
      lineDelays: Array.from({ length: lines }, () => 0),
      actionsDelay: 0,
      totalMs: 0,
    };
  }

  if (calm) {
    // Bez stepenice: pozdrav i rečenica u istom koraku, pa akcije.
    return {
      animated: true,
      greetingDelay: 0,
      lineDelays: Array.from({ length: lines }, () => 0),
      actionsDelay: BRIEF_STEP_GAP_MS,
      totalMs: BRIEF_STEP_GAP_MS + BRIEF_FADE_MS,
    };
  }

  const lineDelays = Array.from({ length: lines }, (_, i) => (i + 1) * BRIEF_STEP_GAP_MS);
  const actionsDelay = (lines + 1) * BRIEF_STEP_GAP_MS;
  return {
    animated: true,
    greetingDelay: 0,
    lineDelays,
    actionsDelay,
    totalMs: actionsDelay + BRIEF_FADE_MS,
  };
}
