---
name: Family Module Removed
description: Family modul (FamilyGroups + sharing + split + chat + invitations) potpuno uklonjen 8.6.2026 — zamijenjen Krug modulom
type: constraint
---

Family modul je uklonjen 8.6.2026 nakon odluke da Krug preuzima ulogu kolaborativnog modula. Svi testni podaci (24 retka) obrisani, nema produkcijskih korisnika koji su koristili Family.

**Što je obrisano:**
- 13 `family_*` tablica (CASCADE), 15 PL/pgSQL funkcija, 13 trigera
- `expenses.is_private`, `expenses.split_overrides`, `profiles.family_override_push/family_reactions_push/family_mode_enabled` kolone
- 13 `useFamily*` hookova, `src/components/family/`, `src/pages/Family.tsx`, `src/pages/JoinFamily.tsx`, `src/types/family.ts`
- `src/lib/familySplit*.ts`, `familyForecastContrib.ts`, `familySettlements.ts`, `familyRelationships.ts`, `familySettlementPdf.ts`
- Edge function `notify-family-event`
- Family grane u `send-member-invitation`, `respond-to-invitation`, `process-pending-deletions`, `consume_invitation_token`
- Family namespace iz `hr/en/de.json`
- Rute `/family`, `/join-family`

**Što ostaje (svjesno):**
- `AppStateContext.krugModeEnabled` (renamed iz familyModeEnabled, localStorage ključ `krug_mode_enabled`)
- `AppModule` enum vrijednost `'krug'` (umjesto `'family'`)
- `payment_source_members` tablica — koristi se ručno preko Shared Wallet UI-a, samo 3 orphan reda obrisana
- Budget/Project invitation tokovi netaknuti

**Constraint:** Family se NE vraća. Sve buduće kolaborativne funkcije idu kroz Krug (`krug`, `krug_membership`, `krug_ownership`).

Deprecated memory files koje sad treba zanemariti:
- `family-module-phase-1`, `family-proportional-split`, `family-and-collaboration-system`, `family-chat-removed`, `family-shared-source-auto-limited`
