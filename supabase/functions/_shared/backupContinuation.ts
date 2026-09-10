// Čiste odluke o nastavku tjedne kopije i slanju maila.
// Bez I/O — koriste ih i edge funkcija i testovi.

/** Najviše nastavaka po datumu (zaštita od petlje). */
export const MAX_CONTINUATIONS = 6;

export type RunState = {
  /** Zip datoteka nije dovršen u ovom pokretanju. */
  filesZipIncomplete: boolean;
  /** Prilozi koji još nisu prekopirani u `_files/`. */
  filesRemaining: number;
  /** Redni broj nastavka (0 = prvo pokretanje). */
  continuation: number;
};

/** Iz tijela zahtjeva pročitaj redni broj nastavka; nedostaje = 0. */
export function parseContinuation(body: unknown): number {
  const raw = (body as { continuation?: unknown } | null | undefined)?.continuation;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_CONTINUATIONS);
}

/** Je li kopija za taj datum potpuna? */
export function isRunComplete(state: RunState): boolean {
  return !state.filesZipIncomplete && state.filesRemaining <= 0;
}

/** Pokrenuti sljedeće pokretanje? Samo kad je nepotpuno i nisu iscrpljeni nastavci. */
export function shouldContinue(state: RunState): boolean {
  if (isRunComplete(state)) return false;
  return state.continuation < MAX_CONTINUATIONS;
}

export type MailDecision =
  | { send: false }
  | { send: true; incomplete: false }
  | { send: true; incomplete: true };

/**
 * Mail ide samo jednom po datumu: kad je sve potpuno, ili kad su nastavci
 * iscrpljeni (tada s naslovom „NEPOTPUNA kopija").
 */
export function decideMail(state: RunState): MailDecision {
  if (isRunComplete(state)) return { send: true, incomplete: false };
  if (state.continuation >= MAX_CONTINUATIONS) return { send: true, incomplete: true };
  return { send: false };
}

/** Razlog uz „NEPOTPUNA kopija" mail. */
export function incompleteReason(info: {
  partsDone: number;
  partsPlanned: number;
  filesRemaining: number;
}): string {
  const missingParts = Math.max(0, info.partsPlanned - info.partsDone);
  return [
    `Nedostaje ${missingParts} od ${info.partsPlanned} dijelova zipa datoteka`,
    `neprekopiranih priloga: ${Math.max(0, info.filesRemaining)}`,
    `nakon ${MAX_CONTINUATIONS} nastavaka`,
  ].join("; ") + ".";
}
