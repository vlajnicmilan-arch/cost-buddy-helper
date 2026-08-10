/**
 * IMPORT REVIEW — IZVEDENI SMJER PRIJENOSA.
 *
 * Pravilo koje se ne pregovara: ako na izvodu piše predznak (redak je došao
 * kao odljev ili priljev), aplikacija NE pita korisnika što na papiru već
 * doslovno piše. Predznak je odgovor.
 *
 * Izvori smjera, po jačini:
 *   1. `amount`      — predznak retka s izvoda (parser: `expense` → 'out',
 *                      `income` → 'in'). Uvijek pobjeđuje.
 *   2. `description` — `classifyTransferDescription` (ključne riječi).
 *   3. `null`        — smjer je stvarno neizvediv → tek TADA se pita.
 *
 * Kad se opis i predznak KOSE, predznak pobjeđuje i UI pokaže sitno
 * upozorenje (ne pitanje). Čisti modul, bez Reacta.
 */

import { classifyTransferDescription, type MoneyDirection } from '../moneyDirection';

export type DirectionSource = 'amount' | 'description' | 'rule' | null;

export interface ResolvedTransferDirection {
  readonly direction: MoneyDirection | null;
  readonly source: DirectionSource;
  /** Opis je tvrdio suprotno od predznaka — predznak je pobijedio. */
  readonly conflict: boolean;
}

export interface ResolveTransferDirectionInput {
  /** Smjer izveden iz predznaka retka na izvodu; `null` = izvod ga ne nosi. */
  readonly statementDirection?: MoneyDirection | null;
  readonly description?: string | null;
  /** Smjer naučenog pravila — koristi se samo kad izvod nema predznak. */
  readonly ruleDirection?: MoneyDirection | null;
}

export function resolveTransferDirection(
  input: ResolveTransferDirectionInput,
): ResolvedTransferDirection {
  const fromDescription = classifyTransferDescription(input.description).direction;
  const fromStatement = input.statementDirection ?? null;

  if (fromStatement === 'in' || fromStatement === 'out') {
    return {
      direction: fromStatement,
      source: 'amount',
      conflict: !!fromDescription && fromDescription !== fromStatement,
    };
  }

  if (input.ruleDirection === 'in' || input.ruleDirection === 'out') {
    return { direction: input.ruleDirection, source: 'rule', conflict: false };
  }

  if (fromDescription) {
    return { direction: fromDescription, source: 'description', conflict: false };
  }

  return { direction: null, source: null, conflict: false };
}

/** Smjer iz parserovog tipa retka (`expense`/`income`). Ostalo → null. */
export function statementDirectionFromType(
  type: string | null | undefined,
): MoneyDirection | null {
  if (type === 'expense') return 'out';
  if (type === 'income') return 'in';
  return null;
}
