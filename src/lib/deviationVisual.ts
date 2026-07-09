/**
 * Smjer v1 — vizualna hijerarhija odstupanja (stvarno − planirano).
 *
 * Pravila (odobrena od vlasnika):
 * - dev > 0  (stvarno > planirano)  → topla narančasta (bg-warning ton), strelica ↑
 * - dev < 0  (stvarno < planirano)  → NEUTRALNO (manje potrošeno ≠ automatski uspjeh)
 * - dev = 0                         → NEUTRALNO, bez ikone
 * - crvene NEMA nigdje (nema pouzdanog pojma "kritično")
 */
export type DeviationTone = "over" | "neutral";

export interface DeviationVisual {
  tone: DeviationTone;
  /** Tailwind text color class */
  className: string;
  /** Prefix znak za iznos: '+', '−' ili '±' */
  sign: "+" | "−" | "±";
  /** Prikazuje se strelica gore? (samo za over) */
  showUpArrow: boolean;
}

export const getDeviationVisual = (deviation: number): DeviationVisual => {
  if (deviation > 0) {
    return {
      tone: "over",
      // topla narančasta — postojeći --budget-warning token
      className: "text-budget-warning",
      sign: "+",
      showUpArrow: true,
    };
  }
  if (deviation < 0) {
    return { tone: "neutral", className: "text-foreground", sign: "−", showUpArrow: false };
  }
  return { tone: "neutral", className: "text-muted-foreground", sign: "±", showUpArrow: false };
};
