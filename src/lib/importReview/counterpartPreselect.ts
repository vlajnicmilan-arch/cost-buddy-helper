/**
 * UVOZ IZVODA — PREDODABIR druge strane prijenosa.
 *
 * Isto prepoznavanje koje koristi bankovna sinkronizacija
 * (`src/lib/transferCounterpart.ts`), ali ovdje je rezultat SAMO PRIJEDLOG u
 * nacrtu pregleda uvoza: ništa ne ulazi u knjige bez „Potvrdi uvoz".
 *
 * Redoslijed prednosti u pozivatelju: zapamćeno pravilo > ovaj predodabir >
 * prazno (korisnik bira).
 */

import { extractCardMasks, matchUserCard, type UserCardRef } from '../cardMatch';
import {
  resolveOwnTransferCounterpart,
  type OwnTransferResolution,
} from '../transferCounterpart';

/** Novčanik korisnika s upisanim karticama (podskup `CustomPaymentSource`). */
export interface PreselectWallet {
  readonly id: string;
  readonly name: string | null;
  readonly cards?: ReadonlyArray<{ readonly id?: string; readonly last_four_digits?: string | null }> | null;
}

export interface PreselectInput {
  /** Novčanik čiji se izvod uvozi — nikad nije kandidat za drugu stranu. */
  readonly sourceWalletId: string;
  readonly description?: string | null;
  readonly merchantName?: string | null;
  readonly wallets: readonly PreselectWallet[];
}

export type CounterpartPreselect = OwnTransferResolution;

/**
 * Jednoznačan pogodak (kartica ili ime) → `own_transfer` s ciljem.
 * Dva ili nijedan → `ambiguous` / `none` (korisnik i dalje bira).
 */
export function preselectTransferCounterpart(input: PreselectInput): CounterpartPreselect {
  const text = [input.merchantName ?? '', input.description ?? ''].filter(Boolean).join(' ');
  if (!text.trim()) return { kind: 'none' };

  const cards: UserCardRef[] = [];
  for (const w of input.wallets) {
    for (const c of w.cards ?? []) {
      if (!c?.last_four_digits) continue;
      cards.push({
        id: c.id ?? `${w.id}:${c.last_four_digits}`,
        last_four_digits: c.last_four_digits,
        payment_source_id: w.id,
      });
    }
  }

  const cardHit = matchUserCard(extractCardMasks(text), cards);

  return resolveOwnTransferCounterpart({
    syncPaymentSourceId: input.sourceWalletId,
    cardPaymentSourceId: cardHit?.paymentSourceId ?? null,
    counterpartyText: text,
    wallets: input.wallets.map(w => ({ id: w.id, name: w.name })),
  });
}
