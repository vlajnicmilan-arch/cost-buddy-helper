# Plan: Potpuno uklanjanje Family modula

## Sažetak provjere ovisnosti

**Krug ↔ Family — provjerena 1 točka spoja:**
- `src/pages/Krug.tsx:28` — `hasAccess('family_groups')` gate (legacy, slučajno preuzet). Krug nema FK, RPC ni triger ovisnost o family_*.

**DB stanje (verificirano):**
- 13 family_* tablica, ukupno **24 retka testnih podataka**
- 0 vanjskih FK pokazuje na family_* → CASCADE neće zahvatiti ništa van family domene
- 19 PL/pgSQL funkcija + 13 trigera na family_* tablicama
- 3 retka `payment_source_members.role='limited'` stvorenih kroz family auto-sync — postaju siročad nakon brisanja (FK ide na custom_payment_sources). Korisnik potvrdio: sve testno, briše se.

**Edge funkcije pogođene:**
- `notify-family-event` — brisanje
- `send-member-invitation`, `respond-to-invitation`, `process-pending-deletions` + `consume_invitation_token` RPC — uklanjanje `family` grane (zadrži budget/project/krug)

**Frontend (33 fajla):**
- Stranice: `Family.tsx`, `JoinFamily.tsx` + rute u `App.tsx`
- Cijeli `src/components/family/` direktorij
- 13 `useFamily*` hookova + `src/lib/familySplitSuggestion.ts`
- Reference: `AppStateContext.tsx`, `HomeHeader.tsx`, `PageHeader.tsx`, `SettingsDialog.tsx`, `NotificationsSection.tsx`, `NotificationsDropdown.tsx`, `useFeatureAccess.ts`, `useModuleStates.ts`, `useNotificationPreferences.ts`, `dataExportZip.ts`, `nativePush.ts`

**Drugi moduli netaknuti (provjereno):** Krug, Bank sync, Trash, Soft delete, Budgets, Projects, Subscriptions, Shared Wallet (`payment_source_members` ručno upravljanje ostaje).

---

## Koraci

### 1. DB migracija (jedna)
- DROP 13 trigera na family_* tablicama
- DROP 15 family funkcija (is_family_*, audit_family_*, fss_*, fm_*, compute_family_*, refresh_family_*, apply_split_override, record_settlement, add_family_owner_as_member)
- ALTER `consume_invitation_token` — ukloniti `family` ELSIF granu
- ALTER `e2e_reset_user` — ukloniti family DELETE-ove
- DROP 13 family_* tablica CASCADE
- ALTER `profiles` DROP `family_override_push`, `family_reactions_push` (i `family_mode_enabled` ako postoji)
- DELETE 3 orphan `payment_source_members` redaka s `role='limited'`

### 2. Edge funkcije
- Brisanje `supabase/functions/notify-family-event/` (rm + delete_edge_functions)
- Patch `send-member-invitation`, `respond-to-invitation`, `process-pending-deletions` — bez family grane

### 3. Brisanje koda
- `src/pages/Family.tsx`, `src/pages/JoinFamily.tsx`
- Cijeli `src/components/family/` direktorij
- 13 `useFamily*.ts` hookova
- `src/lib/familySplitSuggestion.ts`
- Rute `/family`, `/join-family` u `App.tsx`

### 4. Čišćenje referenci
- `Krug.tsx`: ukloniti `hasAccess('family_groups')` gate (opcija a)
- `useFeatureAccess.ts`, `useModuleStates.ts`: ukloniti `family_groups`/`family_mode` ključeve
- `AppStateContext.tsx`: ukloniti `familyModeEnabled` state + setter
- `HomeHeader.tsx`, `PageHeader.tsx`, `SettingsDialog.tsx`: ukloniti Family menu stavke
- `NotificationsSection.tsx`, `NotificationsDropdown.tsx`, `useNotificationPreferences.ts`: ukloniti family toggle-ove i invitation kategorije
- `dataExportZip.ts`: ukloniti family_* iz exporta
- `nativePush.ts`: ukloniti `/family/...` deeplinke

### 5. i18n
Ukloniti `family.*` namespace iz `hr.json`, `en.json`, `de.json`.

### 6. Memory cleanup
Označiti deprecated: `family-module-phase-1`, `family-proportional-split`, `family-and-collaboration-system`, `family-chat-removed`, `family-shared-source-auto-limited`.

---

## Verifikacija (nakon izvršenja)

1. `rg "family_|useFamily|/family" src/ supabase/functions/` → prazno (osim povijesnih migracija)
2. Krug se otvara bez blokade
3. `npm test` prolazi
4. TypeScript build prolazi (types.ts se regenerira nakon migracije)
5. Smoke: dashboard, Krug, projekti, budžeti, postavke, transaction detail, invitation flow

---

## Što NE diramo
- Krug i sve `krug_*`
- Povijesne migracije (immutable)
- `payment_source_members` tablica (samo se brišu 3 orphan reda)
- Budget/Project invitation tokovi (samo se uklanja family grana iz dijeljene edge funkcije)
- `email_send_log` povijesni redovi
