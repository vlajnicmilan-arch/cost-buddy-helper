---
name: collaborator-advances
description: Avansi suradnicima u projektima — collaborator_id+is_advance+linked_advance_ids na expenses, netiranje u projectCalculations, UI samo unutar projekata
type: feature
---
Sustav avansa za suradnike projekta. Konvencija: konačni račun je BRUTO (uključuje već isplaćene avanse). Sistem oduzima sumu povezanih avansa.

DB (expenses):
- `collaborator_id uuid` → project_collaborators (ON DELETE SET NULL)
- `is_advance boolean DEFAULT false`
- `linked_advance_ids uuid[] DEFAULT '{}'` — na konačnom računu
- Trigger `validate_advance_links`: blokira (a) dvostruko vezivanje istog avansa, (b) mismatch collaborator_id, (c) označavanje konačnog računa s linkovima kao avansa

Pravila:
- Avans samo za suradnike (project_collaborators), NE za workers
- 1 avans → max 1 konačni račun (ne dijeli se)
- 1 konačni račun → može povući VIŠE avansa istog suradnika
- Surplus (linkedSum > amount): plan kaže auto-debt u business_debts, ali zahtijeva business_profile_id; trenutno samo UI warning + cap netto na 0
- Avansi se unose ISKLJUČIVO kroz transakcije s odabranim projektom (AddExpenseDialog → ManualExpenseForm → AdvanceLinkSection)

Kod:
- `src/components/add-expense/AdvanceLinkSection.tsx` — UI: checkbox is_advance + dropdown suradnika + "Dodaj novog" inline forma + checkboxi za vezanje nepovezanih avansa + live preview Bruto/Net
- `src/hooks/useCollaboratorAdvances.ts` — getUnlinked, getSummary, linkAdvancesToInvoice
- `src/lib/projectCalculations.ts` → `calculateNetExpenseAmount(expense, allExpenses)`:
  - advance: 0 ako vezan, full amount ako nepovezan
  - invoice: max(amount − sum(linkedAdvances), 0)
- `calculateProjectSpent` koristi calculateNet → ELIMINIRA dvostruko brojanje
- AddExpenseDialog state: isAdvance, collaboratorId, linkedAdvanceIds; reset u resetForm; insert polja u scanned + regular branch (NE u installment)

i18n: `projects.advances.*` u hr/en/de.json

NE radi se još (sljedeća iteracija):
- Badge "Avans" u listi transakcija
- Sažetak po suradniku u ProjectCollaboratorsList
- Automatski business_debts insert na surplus (sad samo warning)
- Auto-suggest avansa po keyword-u opisa
- Backfill postojećih transakcija (ručno preko edit)
