## Problem
Kad se faza poveća u obujmu (dogovoreni dodatni rad s klijentom), trenutno se može zabilježiti `scope_change` revizija koja diže **interni trošak faze**, ali se **`contract_value`** (dogovoreni iznos s klijentom) ne mijenja. Posljedica: P&L kriv, „loss zone" alarm se okida lažno, povijest aneksa ugovora ne postoji.

## Rješenje

### A. Proširiti `MilestoneBudgetChangeSection` (samo za `scope_change`)
Kad korisnik odabere tip revizije **`scope_change`**, ispod iznosa pojavi se nova sekcija:

```
┌─ Aneks ugovora s klijentom ─────────────────┐
│ ☑ Naplati klijentu dodatno                 │
│   Iznos koji naplaćuješ: [ 500,00 ] €      │
│   (predloženo = čisti trošak povećanja)    │
│   Napomena: [____________________________] │
└─────────────────────────────────────────────┘
```

- Sekcija vidljiva SAMO za `type === 'scope_change'`.
- Checkbox **default uključen**.
- Default iznos = delta troška (čisti trošak, bez automatske marže). Korisnik može mijenjati.
- Za `overrun` / `saving` / `correction` — sekcija se ne prikazuje.

### B. Nova tablica `project_contract_amendments` (audit log)
- Kolone: `id`, `project_id`, `amendment_amount`, `note`, `linked_revision_id` (FK na `milestone_budget_revisions`, nullable), `created_at`, `created_by`
- RLS: identično `milestone_budget_revisions` (vlasnik + članovi projekta).
- Na spremanje scope_change revizije s uključenim checkboxom:
  1. Insert u `milestone_budget_revisions` (kao sada)
  2. Insert u `project_contract_amendments`
  3. Update `projects.contract_value += amendment_amount`

Sve tri operacije idu u jednu transakciju preko nove DB funkcije `apply_scope_change_with_amendment(...)` da se izbjegne djelomični commit.

### C. Prikaz aneksa na pregledu projekta
U postojećoj „Ugovor s klijentom" kartici (gdje se prikazuje `contract_value`), ako postoji ≥1 aneks:

```
Originalni iznos:    10.000,00 €
Aneksi (2):          +1.250,00 €   [Vidi]
─────────────────────────────────
Ažurirano:           11.250,00 €
```

- „Originalni iznos" = `contract_value - SUM(amendments)`.
- „Vidi" → mali dialog s listom aneksa (datum, iznos, faza, napomena).
- Ako nema aneksa → prikaz ostaje kao sada (samo „Dogovoreni iznos").

## Datoteke za izmjenu / kreiranje
- **Migracija:** tablica `project_contract_amendments` + RLS + funkcija `apply_scope_change_with_amendment`
- `src/components/projects/MilestoneBudgetChangeSection.tsx` — nova „Aneks ugovora" sekcija
- `src/hooks/useMilestoneRevisions.ts` — proširiti save da poziva novu DB funkciju kad je checkbox uključen
- `src/hooks/useProjectContractAmendments.ts` — novi hook (fetch + total)
- `src/components/projects/ProjectFullScreenView.tsx` (ili gdje god je „Ugovor" kartica) — prikaz aneksa
- `src/components/projects/ContractAmendmentsDialog.tsx` — novi mali dialog za listu aneksa
- `src/i18n/locales/{hr,en,de}.json` — `projects.contractAmendment.*`

## Što se NE dira
- `contract_value` polje na `projects` (samo se inkrementira)
- Avans logika
- `MilestoneBudgetChangeSection` za ostale tipove revizija
- `useProjectLossZoneAlert` — automatski se ispravno ponaša jer `contract_value` raste

## Odluke potvrđene s korisnikom
- Checkbox „Naplati klijentu" default **uključen**, korisnik može isključiti.
- Default iznos = **čisti trošak** povećanja (bez automatske marže).
- Funkcionalnost **samo za `scope_change`**, ne i za `overrun`.
