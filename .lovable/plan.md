# Uklanjanje family chata + audit family modula

## Stanje (verificirano)

**Upotreba u produkciji:**
- `family_messages`: **2 retka** ukupno (chat se ne koristi)
- `chat_messages`: 52 retka — **ovo je AI asistent**, NE family chat. Ostaje netaknuto.
- `family_groups`: 3, `family_members`: 4, `family_invitations`: 3, `family_activity_log`: 5
- `family_shared_sources`: 1, `family_shared_projects`: 2, `family_shared_budgets`: 0, `family_shared_savings`: 0

**Reference na chat:** `FamilyChat.tsx`, sekcija u `FamilyGroupDetailView.tsx` (l. 723–732), edge `notify-family-message`, `initialOpenChat` prop chain (Family.tsx + deep-link iz notifikacija), `dataExportZip.ts` (l. 56), i18n `family.chat*`, `familyDisableWarn3` spominjanje chata, `chat_enabled` u `notification_preferences` (koristi se i za bilješke na transakcijama — **ostaje**, samo se rebranda copy).

---

## Faza 1 — Uklanjanje chata (sada)

### Frontend
- Obriši `src/components/family/FamilyChat.tsx`
- `src/components/family/FamilyGroupDetailView.tsx`:
  - ukloni import `FamilyChat`, `chatSectionRef`, `initialOpenChat` prop, `useLayoutEffect` komentar o FamilyChat, `useEffect` za auto-scroll na chat, cijelu `<section ref={chatSectionRef}>` (l. ~723–732), `MessageCircle` import ako ostane neiskorišten
- `src/pages/Family.tsx`: ukloni `initialOpenChat` state, deep-link grane (`state.openChat`), prosljeđivanje propa
- `src/hooks/useDeepLinks.ts`: ukloni svaku granu koja postavlja `openChat: true` (provjeriti)
- `src/components/NotificationsDropdown.tsx`: ukloni rute koje vode na chat sekciju (ako postoje)
- `src/lib/dataExportZip.ts`: makni `'family_messages'` iz liste tablica za export

### i18n (hr/en/de)
- Ukloni ključeve: `family.chat`, `family.writeMessage`, `family.sendError`, `family.deleteError`, `family.noMessages`, `family.doubleClickDelete`
- `settings.familyModeDesc`: makni "i chat" iz opisa
- `settings.familyDisableWarn3`: ukloni cijelu liniju (Chat poruke i obavijesti)
- `settings.notifChatDesc` (NotificationsSection): preformulirati na "Bilješke na transakcijama i komentari" (chat dio izlazi)

### Backend
- Migracija: `DROP TABLE public.family_messages CASCADE;` + `DROP FUNCTION public.cleanup_old_chat_messages()` **NE** (to je za AI chat_messages — ostaviti); ALI postoji `maybe_cleanup_chat_messages` trigger funkcija → provjeriti je li vezana na family_messages ili chat_messages; ako na chat_messages → ostaviti
- Obriši edge funkciju `notify-family-message` (via delete_edge_functions)
- `notification_preferences.chat_enabled`: **zadrži** (sada pokriva samo bilješke na transakcijama)

### Tests
- Ako postoji test koji referencira `FamilyChat` ili `family_messages` → ukloniti

---

## Faza 2 — Audit family modula (preporuke, ne implementacija)

Opservacije nakon pregleda koda i brojeva:

1. **Family grupa je "meta-bundler" preko postojećih invitation sustava.** Svaki resurs (project, budget, payment_source) već ima svoj invitation flow (`project_invitations`, `budget_invitations`, `payment_source_invitations`). Family grupa dodaje 4. sloj (`family_invitations` + `family_shared_*` join tablice) koji uglavnom duplicira funkciju "podijeli ovaj resurs s nekim".

2. **Brojke pokazuju da feature ne živi:** 3 grupe na cijeloj aplikaciji, 0 budgeta i 0 savings dijeljeno. Sav stvarni sharing ide kroz direktne invitation flowove na pojedini resurs.

3. **`family_activity_log`** dupla `project_activity_log` — drugi je puno bogatiji i koristi se aktivno.

### Preporučene opcije za sljedeći potez (NE u ovoj fazi):

- **Opcija A — minimalno čišćenje:** zadržati family grupu kao "label/folder" preko sharing-a, ali ukloniti `family_activity_log` i pojednostaviti detail view (jedan tab umjesto 4 sekcije).
- **Opcija B — duboka konsolidacija:** ukinuti family grupe u potpunosti, ostaviti per-resource sharing (koji već radi). UI bi bio jedan "Dijeljeno sa mnom" pregled koji agregira sve resurse na koje sam pozvan/koje dijelim.
- **Opcija C — status quo nakon chata:** ne dirati ništa drugo, vidjeti hoće li se upotreba pomaknuti.

Ovo su prijedlozi za razgovor nakon Faze 1 — ne radim ništa od ovoga bez tvoje odluke.

---

## Što NE diram
- `chat_messages` tablica (AI asistent)
- `FinancialAssistantDialog`, `useFinancialAssistant` 
- `family_groups`, `family_members`, `family_invitations`, `family_shared_*` tablice
- `JoinFamily.tsx`, `useFamilyGroups`, `send-member-invitation`, `respond-to-invitation` edge fn
- Feature gating (`useFeatureAccess` → `family_groups`)

---

## Memo update
Dodati memo `mem://features/family-chat-removed` s razlogom uklanjanja + napomenom da `chat_enabled` pref sada pokriva samo transaction notes. Ažurirati `mem://features/family-and-collaboration-system` da odražava bez-chat stanje.
