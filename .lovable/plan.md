# Read-Only Politika — Plan (pre-launch, obećanje iz ToS §3)

Cilj: uskladiti aplikaciju s onim što je već potpisano u Uvjetima korištenja. Bez aktivnog entitlementa i iznad Free limita korisnik **vidi svoje podatke i može ih izvesti**, ali ne može stvarati/uređivati/brisati. Ništa se ne briše, ništa se ne skriva.

Izvor istine: **`has_entitlement(user, module)`** iz Faze 5. Nema paralelnog sustava.

---

## 1) Inventar — mjesta koja danas SKRIVAJU umjesto da pokažu (moraju postati read-only)

| Mjesto | Danas | Poslije |
|---|---|---|
| `src/pages/Krug.tsx` (bez `krug` entitlementa) | `UpgradePrompt` umjesto sadržaja — korisnik NE VIDI vlastite Krug transakcije | Prikaz svih vlastitih Krug zapisa (read-only), izvoz radi, gornji banner "Krug je zaključan — možeš čitati i izvesti, za nove akcije aktiviraj Krug" + CTA |
| `src/components/guards/BusinessModeGuard.tsx` | Auto-gasi `business_mode_enabled` u profilu nakon 2 ciklusa bez pristupa — biznis profil i projekti "nestanu" | NE gasiti flag. Ostaviti biznis mod aktivan, ali domenu prebaciti u read-only (banner + write guard). Podaci vidljivi. |
| `src/pages/Projects.tsx` (bez `projekti`) | `UpgradePrompt` na cijeloj stranici | Lista projekata + drill-in u read-only (koristi postojeći `ProjectReadOnlyBanner` + `useProjectWriteGuard`, oba već postoje iz PR1) |
| `src/components/custom-categories/CustomCategoriesPanel.tsx` | `UpgradePrompt` | Lista postojećih kategorija read-only + banner |
| `src/components/installments/InstallmentsPanel.tsx` | `UpgradePrompt` | Lista rata read-only + banner |
| `src/components/savings/SavingsGoalsSection.tsx` | `UpgradePrompt` | Lista ciljeva read-only + banner |
| `src/components/recurring/RecurringTransactionsPanel.tsx` | `UpgradePrompt` | Lista pravila read-only + banner; automatsko generiranje NE stvara nove zapise dok je zaključano (server-side gate, v. §4) |
| `FinancialAssistantDialog` (AI) | Blok kad nema `ai_assistant` | Ostaviti kako je — AI je feature, nije "korisnikov podatak". Kvota već postoji. |

Transakcije, novčanici, budžeti već su vidljivi ✅ i izvoz radi ✅ — samo dodati write guard (§2).

---

## 2) Inventar PISANJA — što se blokira i kako

Centralna komponenta: **`useWriteGuard(module)`** hook (novi, mirror `useProjectWriteGuard` iz PR1). Vraća `{ canWrite, blockProps, guard(), guardedAction() }`. `canWrite = has_entitlement(module) || (module==='smjer' && withinFreeLimits(action))`.

Mjesta koja moraju proći kroz guard:

**Smjer (transakcije/novčanici/budžeti/kategorije):**
- `AddExpenseDialog` (Save) — blok kad `!canAddTransaction` (Free limit) ILI kad korisnik pokušava editirati postojeću a nema `smjer`
- `EditExpenseDialog`, swipe-to-delete na `TransactionList`, bulk delete, "Označi plaćeno"
- Novčanici: `AddPaymentSourceDialog`, edit, delete, anchor set (`set_source_anchor` RPC)
- Budžeti: `AddBudgetDialog`, edit, delete, invite member
- Kategorije: `CustomCategoriesPanel` CRUD
- Rate/Savings/Recurring/Reminders: sve CUD akcije
- Import (CSV/PDF/bank sync): blok write koraka; parsing i preview smiju raditi

**Krug:** approve, retract, add expense u Krug, dijeljenje source-a, deletion request/vote

**Projekti:** već pokriveno `useProjectWriteGuard` — proširi da `owner_readonly` uključuje "nema `projekti` entitlement" (danas već radi kroz `hasAccess('projects')`, samo osigurati da čita entitlements a ne stari tier)

**Biznis:** switching biznis profila OK, sve CUD (računi, klijenti, invoices, business debts) — guard

**Poruka:** svaki blokirani gumb pokazuje **StatusFeedback** s tekstom (i18n):
- Free limit: "Dosegnut je besplatni limit (30/mj). Aktiviraj Smjer za neograničeno."
- Read-only modul: "{Modul} je u načinu čitanja. Aktiviraj pretplatu za nove izmjene."
- Uz **CTA gumb** koji vodi na `/paywall?module=<x>`.

Nikad sivi gumb bez objašnjenja. `blockProps` postavlja `aria-disabled` + tooltip s razlogom; klik ipak prolazi da se pokaže feedback (dostupno ključem tipkovnice i za screen readere).

---

## 3) Otpornost brojača 30 transakcija/mj na brisanje

Trenutno `useFreeLimits` broji `expenses` u tekućem mjesecu → **rupa**: obriši 30 starih → dobiješ novih 30. Nedopustivo.

**Odabir: server-side increment-only brojač u novoj tablici `free_tier_usage_monthly`.**

```
free_tier_usage_monthly(user_id, month_key TEXT, transactions_created INT, updated_at)
PRIMARY KEY (user_id, month_key)  -- npr. '2026-08'
```

- Trigger `AFTER INSERT ON expenses` (samo za `expense_nature IN ('income','expense')`, ne za korekcije/transfere): `INSERT ... ON CONFLICT (user_id, month_key) DO UPDATE SET transactions_created = transactions_created + 1`.
- Trigger **ne dekrementira** na DELETE. Brisanje NE oslobađa mjesto.
- Klijent čita `free_tier_usage_monthly.transactions_created` za tekući mjesec preko postojećeg TanStack query hooka; `canAddTransaction = has_entitlement('smjer') || counter < 30`.
- RLS: `SELECT` samo za `auth.uid() = user_id`. Nema INSERT/UPDATE/DELETE iz klijenta (samo trigger, SECURITY DEFINER).

Zašto ne "count po created_at uključujući obrisane": trenutno nemamo soft-delete na `expenses` osim `deleted_at` (Trash) — pouzdaniji je eksplicitni brojač, ne ovisi o retenciji Trash-a i preživi hard delete iz Trash-a.

Backfill za postojeće korisnike: jednokratna migracija koja popuni brojač iz `expenses.created_at` po mjesecu (uključi trenutno "žive"). Za obrisane iz prošlih mjeseci — nema potrebe, prošli mjeseci se ne provjeravaju.

---

## 4) Serverska zaštita (RLS/RPC)

Bez ovoga UI je paravan. Fazno:

**Faza A (MORA prije launcha):**
1. **Brojač 30/mj** (§3) — trigger + tablica + RLS.
2. **`INSERT ON expenses` guard**: BEFORE INSERT trigger `enforce_free_transaction_cap()`:
   - Ako `has_entitlement(NEW.user_id, 'smjer')` → dopusti.
   - Inače: pročitaj `free_tier_usage_monthly` za mjesec od `NEW.date` (fallback `now()`); ako ≥ 30 → `RAISE EXCEPTION 'free_limit_exceeded'`.
3. **`INSERT ON custom_payment_sources` guard**: ako nema `smjer` i broj postojećih ≥ 1 → block.
4. **`INSERT ON budget_plans` guard**: analogno, ≥ 1 → block.
5. **RLS refit za module** (write only, čitanje ostaje širom otvoreno svom vlasniku):
   - `krug`: policy `INSERT/UPDATE/DELETE` na `krug`, `krug_membership`, `krug_shared_payment_source`, `krug_deletion_request/vote` zahtijeva `has_entitlement(auth.uid(), 'krug')`. SELECT nedirnut.
   - `projekti`: sve `projects/project_*` write policy uvjetuje `has_entitlement(auth.uid(), 'projekti')` (ali ostaviti `project_members` iznimke: participant može svoj work log — već je logika u `useProjectWriteGuard`, mirror u SQL preko `is_project_participant()`).
   - `biznis`: `business_profiles/business_debts/invoices/clients/...` write zahtijeva `has_entitlement('biznis')`.
   - Napredni `smjer`: `recurring_transactions`, `savings_goals`, `installments`, `custom_categories` write zahtijeva `has_entitlement('smjer')`.

**Faza B (može poslije launcha, ali unutar 2 tj.):**
- Recurring generator (edge cron) provjerava `has_entitlement('smjer')` prije inserta — inače preskoči i ostavi audit red.
- Import edge funkcije (`parse-pdf-statement`, CSV commit) provjeravaju kapacitet prije write koraka.

**Opseg Faze A:** ~1 dan SQL + ~pola dana testovi.

---

## 5) Kako se slaže s Fazom 5

- `useWriteGuard` čita **isti `entitlements`** objekt iz `SubscriptionContext` koji je Faza 5 već izložila. Nema novog fetcha, nema novog cachea.
- Kill-switch `entitlements_mode` (legacy/dual/entitlements) i dalje vrijedi — u `legacy` modu write guard koristi legacy tier gate (isto što danas radi `hasAccess`).
- Trial: dok `source='trial'` red postoji i `period_end > now()`, `has_entitlement` vraća true → nema read-only. Kad istekne, korisnik automatski padne u read-only (bez logout-a, bez restart-a).
- BusinessModeGuard: prestaje gasiti flag; umjesto toga poziva `useWriteGuard('biznis')` unutar biznis strana. Zapis u `business_profiles` ostaje. Ovo rješava "biznis nestane" bug.
- `useFreeLimits` počinje čitati serverski brojač, ne lokalno prebrojavanje.

---

## 6) Test matrica

Korisnik: Free (nema entitlementa), 200 starih transakcija (od čega 25 u tekućem mjesecu), 5 projekata (owner), 3 novčanika (napravljeni dok je imao trial), 2 budžeta, 4 krug zapisa.

| Akcija | Očekivano |
|---|---|
| Otvori Home, Transakcije | Vidi svih 200, filtri rade, klik na detalj radi |
| Izvoz CSV/PDF svih 200 | Radi ✅ |
| Backup | Radi ✅ |
| Add expense (25 ovaj mj.) | Dopušteno (25 < 30) |
| Add expense (30. ovaj mj.) | Blok + StatusFeedback + CTA |
| Obriši 5 iz ovog mjeseca pa pokušaj Add | Blok (brojač i dalje 30) |
| Obriši iz prošlog mjeseca | Blok (delete zaključan — nema `smjer`) |
| Edit stare transakcije | Blok |
| Dodaj novi novčanik (ima 3) | Blok (ima ih ≥ 1, treba `smjer`) |
| Dodaj budget (ima 2) | Blok |
| Otvori Krug | Vidi 4 zapisa, banner + CTA |
| Approve/retract u Krugu | Blok |
| Otvori Projekti | Vidi 5 projekata, drill-in radi, tabovi read-only |
| Edit milestone, add expense u projekt | Blok (owner_readonly banner) |
| Izvoz projekta (PDF) | Radi ✅ |
| Otvori Biznis mod | Otvara se, biznis profil postoji, projekti vidljivi |
| Add invoice, add client | Blok |
| Recurring pravilo koje ističe ovaj mjesec | NE generira novu transakciju (server), UI pokazuje "pauzirano" |
| SQL: `INSERT INTO expenses` iz Postgres klijenta | RLS/trigger baca `free_limit_exceeded` ili `not_entitled` |

Zeleno kad svaka linija prolazi ručno + jedan Playwright e2e "free-tier-read-only.spec.ts" koji obradi ključne rute.

---

## 7) Redoslijed i opseg

```text
Korak 1 · SQL: free_tier_usage_monthly + INSERT trigger + backfill      M
Korak 2 · SQL: enforce_free_transaction_cap trigger + testovi           S
Korak 3 · SQL: write policy refit za krug/projekti/biznis/napr.smjer    L  (najveći, ~4h + test)
Korak 4 · useWriteGuard hook (klijent, mirror useProjectWriteGuard)     S
Korak 5 · useFreeLimits čita serverski brojač                            S
Korak 6 · Zamijeni UpgradePrompt read-only prikazima:                    M
           Krug, CustomCategories, Installments, Savings, Recurring, Projects
Korak 7 · BusinessModeGuard: prestaje gasiti flag, samo banner           S
Korak 8 · Uvezi guard u sve pisajuće dijaloge/gumbe (grep + patch)       M
Korak 9 · i18n stringovi (HR/EN/DE) za banere + toaste                   S
Korak 10 · Playwright e2e: free-tier-read-only.spec.ts                   S
Korak 11 · Ručna test matrica (§6) na preview URL                        M
```

Legenda: S ≈ 30 min, M ≈ 1–2h, L ≈ 3–5h. **Ukupno: ~2 radna dana implementacije + pola dana testiranja.**

**Kritični put do launcha (28.8.):** Koraci 1–5 + 10 su neizostavni. Koraci 6–8 (UI read-only) također — inače ToS §3 i dalje laže. Korak 3 (RLS refit) je najrizičniji; ako klizi, možemo lansirati s Fazom A minimuma (samo `expenses`/`sources`/`budgets` triggeri) i modul-specifične RLS deploy-ati u tjednu nakon launcha — ali tada UI guard je jedina brava za krug/projekti/biznis write. **Milan bira: full A prije launcha ili degradirani opseg.**

---

## Otvorena pitanja za Milana prije koda

1. **Opseg Faze A za launch**: full (uključno §4.5 RLS refit svih modula) ili minimum (samo §4.1–4.4 + UI guard)?
2. **Brisanje starih transakcija na Free**: zaključati (predlažem) ili dopustiti? Ako dopustiti — otvara se rizik da user briše da napravi mjesta u UI-u iako brojač ostaje; poruka bi trebala jasno reći "brisanje ne oslobađa limit".
3. **Recurring bez `smjer`**: pauzirati generator (predlažem) ili pustiti da generira i onda odbije na trigger razini (bučno)?
4. **Trial istek mid-mjesec**: brojač 30/mj kreće od 0 od idućeg mjeseca, tekući mjesec nastavlja koliko je već potrošeno — OK?

Čekam odobrenje.
