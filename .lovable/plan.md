## Problem

Avans polja (`is_advance`, `collaborator_id`, `linked_advance_ids`) integrirana su samo u `ManualExpenseForm` / `AddExpenseDialog` (globalni unos). Međutim, **transakcije unutar projekta** (`ProjectTransactionsTab`) koriste **vlastite inline dijaloge** za dodavanje i uređivanje koji uopće ne učitavaju ni ne spremaju ta polja.

Posljedica:
- Pri otvaranju postojeće avans transakcije nema checkboxa "Avans", padajućeg izbornika suradnika ni sekcije za vezanje
- Pri kreiranju iz projekta isto ne postoji UI za avans (iako spec kaže da je avans dopušten **samo** iz projektnih transakcija)

## Rješenje

Ubaciti `AdvanceLinkSection` u oba inline dijaloga unutar `ProjectTransactionsTab.tsx` i proširiti add/edit handlere da rade s tim poljima.

### 1. Add dialog (kreiranje)

- Dodati state: `isAdvance`, `collaboratorId`, `linkedAdvanceIds`
- Renderirati `<AdvanceLinkSection>` ispod postojećih polja, **samo kad je `expenseType === 'expense'`** (avans nema smisla za prihod)
- `resetForm()` resetira nova polja
- `handleAddExpense` u `insert` payloadu dodaje:
  ```ts
  is_advance: isAdvance,
  collaborator_id: collaboratorId || null,
  linked_advance_ids: linkedAdvanceIds.length ? linkedAdvanceIds : null,
  ```

### 2. Edit dialog (uređivanje postojeće)

- Dodati state: `editIsAdvance`, `editCollaboratorId`, `editLinkedAdvanceIds`
- U `handleOpenEdit` (oko linije 379) prepuniti vrijednosti iz `editingExpense` (`is_advance`, `collaborator_id`, `linked_advance_ids`)
- Renderirati `<AdvanceLinkSection>` u edit dijalogu (samo za `expense` tip)
- `handleSaveEdit` (oko linije 392) u `update` payload dodaje ta tri polja
- Kad se transakcija mijenja u/iz avansa, neto iznos projekta se automatski preračunava jer `projectCalculations.calculateNetExpenseAmount` već poznaje logiku

### 3. Validacija (UI sloj)

- Ako je `isAdvance === true` i `collaboratorId` nije odabran → disable Save + inline poruka (`projects.advances.collaboratorRequired`)
- Ako su `linkedAdvanceIds` postavljeni, automatski isključiti `isAdvance` (već čuva DB trigger, ali UI mora biti konzistentan — `AdvanceLinkSection` to već radi)

### 4. Vidljivost u listi transakcija

Već postoji infrastruktura (badge "Avans"), ali brzo provjeriti da se `is_advance` prikazuje pored transakcije u tabu — ako ne, dodati mali `Badge` u redu liste.

## Što se NE mijenja

- DB shema, trigger `validate_advance_links`, hook `useCollaboratorAdvances`, `projectCalculations` — sve već postoji i radi
- Globalni `AddExpenseDialog` / `ManualExpenseForm` — ostaje kakvi jesu
- Edit/add iz drugih tabova (Home, Business) — avans ostaje isključivo projektni koncept

## Tehnički detalji

**Fajl:** `src/components/projects/ProjectTransactionsTab.tsx` (jedini)
**Import:** `AdvanceLinkSection` iz `@/components/add-expense/AdvanceLinkSection`
**Props koje komponenta očekuje:** `projectId`, `isAdvance`, `setIsAdvance`, `collaboratorId`, `setCollaboratorId`, `linkedAdvanceIds`, `setLinkedAdvanceIds`, `amount`, `type` — provjeriti potpis prije integracije i, ako odstupa, prilagoditi pozive bez modificiranja same komponente.

**i18n:** ključevi `projects.advances.*` već postoje u hr/en/de.

**Mobilni layout:** sekcija mora poštivati 384px breakpoint i 44px touch targets (već riješeno u `AdvanceLinkSection`).
