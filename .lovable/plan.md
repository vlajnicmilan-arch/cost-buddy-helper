## Problem

Na V2 dashboardu `SummarySection` skriva karticu Prijenosi (`compact=true`, komentar kaže "moved to Wallet tab"), ali u `src/pages/Wallet.tsx` zapravo NEMA ničega vezanog za transfere. Premjestaj je ostao polovičan — kartica je nestala s dashboarda, a nikad nije dodana u Novčanik.

## Plan

Dodati u `src/pages/Wallet.tsx` istu vizualnu karticu Prijenosa kakva je bila na dashboardu i otvoriti postojeći `TransferListDialog` (reuse, ne duplicirati).

### Konkretno

1. **`src/pages/Wallet.tsx`**
   - Dohvatiti transfere preko `useExpenses()` (već imamo `allExpenses` / `rawExpenses`) — filtrirati `type === 'transfer'` u memo helperu.
   - Izračunati `monthlyTransfers` (suma za tekući mjesec), `monthlyTransferCount`, `totalTransfers` (apsolutna ovomjesečna suma za prikaz u dialogu).
   - Dodati state `transferDialogOpen`, `useBackButton` integraciju.
   - Renderati karticu (ista struktura kao u `SummarySection` lines 193–228, ali kao zaseban mali komponent radi čistoće) odmah **ispod `CustomPaymentSourcesPanel`**, prije `InstallmentsPanel` — logički susjedna s izvorima plaćanja.
   - Otvarati postojeći `TransferListDialog` (`@/components/TransferListDialog`) — isti koji koristi `SharedDialogs`.

2. **Mali wrapper komponent** `src/components/wallet/WalletTransfersCard.tsx`
   - Props: `monthlyTransfers`, `monthlyTransferCount`, `onClick`.
   - Reuse iste klase/stylinga kao postojeća kartica u `SummarySection` (semantic tokens, `ArrowLeftRight` ikona, i18n ključevi `transactions.transfers`, `transactions.noTransfers`, `common.clickForDetails`).
   - Cilj: jedinstven izvor istine ako se kasnije ukloni iz `SummarySection`.

3. **Bez novih i18n ključeva** — koristimo postojeće (`transactions.transfers`, `transactions.transfer`, `transactions.noTransfers`, `common.clickForDetails`).

4. **Bez izmjena dashboarda** — V2 ostaje compact; jedino vraćamo dostupnost prijenosa kroz Novčanik.

5. **Bez DB migracija, bez business logike**.

### Što NE radim

- Ne diram `SummarySection` ni V2 layout dashboarda.
- Ne duplicira se logika transfera — koristi se isti `TransferListDialog`.
- Ne radi se nova tablica/kontekst.

### Provjera nakon implementacije

- Otvoriti `/wallet` → kartica Prijenosi vidljiva ispod izvora plaćanja, prikazuje mjesečni broj i sumu.
- Klik → otvara `TransferListDialog` s listom transfera.
- Back button zatvara dialog.
- Personal + Business view rade jednako (Novčanik već dijeli komponente).
