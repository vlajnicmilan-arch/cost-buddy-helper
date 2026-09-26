/** Pure helpers for the regular-member ("own party") settlement view. */
import type { SettlementPreview, SettlementTransfer } from '@/hooks/useKrugSettlement';

/** The server marks the reduced response; the client never guesses the role. */
export const isOwnPartyView = (p: SettlementPreview | null | undefined): boolean =>
  !!p?.flags?.own_party_view;

/** Only direct pairs where the caller is one side; anything else is dropped. */
export function splitOwnPartyTransfers(transfers: SettlementTransfer[], userId: string) {
  return {
    iOwe: transfers.filter((tr) => tr.from_user === userId && tr.to_user !== userId),
    owedToMe: transfers.filter((tr) => tr.to_user === userId && tr.from_user !== userId),
  };
}
