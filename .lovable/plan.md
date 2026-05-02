
# Ukidanje poslovnog moda → Jedinstveni novčanik s "Poslovno" oznakom

## Cilj

Ukloniti `/business` rutu i sav paralelni "Business mode" UI. Umjesto toga svaki **izvor plaćanja** može biti označen kao **Poslovni**, a svaka transakcija automatski nasljeđuje karakter izvora. Korisnik filtrira pregled jednim chip-om: **Sve / Osobno / Poslovno**.

## Preduvjet (radiš ti, prije nego krenem)

U aplikaciji obriši svoje testne podatke:
1. Otvori svaku tvrtku → obriši njene transakcije i debts
2. Odveži projekte od tvrtke (uredi projekt → makni klijenta)
3. Obriši business profile

Prije Faze 1 pokrenut ću provjeru — sve mora biti 0:
```sql
SELECT COUNT(*) FROM expenses WHERE business_profile_id IS NOT NULL;
SELECT COUNT(*) FROM business_profiles;
SELECT COUNT(*) FROM business_debts;
SELECT COUNT(*) FROM projects WHERE business_profile_id IS NOT NULL;
```

Ako nije 0, stat — pa ćeš obrisati ručno.

---

## Korisničko iskustvo (rezime)

```text
┌─────────────────────────────────────────┐
│  [Sve]  [Osobno]  [Poslovno]            │ ← jedan filter chip
├─────────────────────────────────────────┤
│  Stanje: 15.700 €                       │ ← prema filteru
│                                         │
│  Erste osobni      4.200 €              │
│  Gotovina          1.500 €              │
│  🏢 Erste poslovni 9.500 €              │ ← badge za poslovno
│  🏢 Poslovna gotovina 500 €             │
│                                         │
│  Transakcije:                           │
│  • Spar         -45 €                   │
│  • 🏢 Najam   -800 €                    │ ← badge za poslovno
└─────────────────────────────────────────┘
```

- **Wallet, Transakcije, Dashboard, Recurring, Izvještaji** — svi imaju isti chip filter
- **Skener računa** — jedna implementacija; "poslovno" se određuje po izvoru
- **Projekti i budžeti** — netaknuti, rade kao i sad
- Filter izbor pamti se u `localStorage` (`wallet_view_mode: 'all' | 'personal' | 'business'`)

---

## Faza 1 — DB migracija (cleanup + nova zastavica)

**Migracija A: Dodaj `is_business` na izvore**
```sql
ALTER TABLE custom_payment_sources
  ADD COLUMN is_business boolean NOT NULL DEFAULT false;
```

**Migracija B: Drop business stupaca/tablica (samo nakon što su brojači 0)**
```sql
-- Drop FK + stupac na expenses
ALTER TABLE expenses DROP COLUMN business_profile_id;

-- Drop FK + stupac na projects
ALTER TABLE projects DROP COLUMN business_profile_id;

-- Drop ostale business reference (recurring_transactions, project_estimates, ...)
-- Lista se generira iz schema-grep-a prije migracije

-- Drop tablice
DROP TABLE business_debts;
DROP TABLE business_profiles;
```

Migracija B se izvršava **tek nakon** što je sav UI/CRUD kod refaktoriran (Faza 4) — inače bi se code još uvijek pisao u nepostojeći stupac.

---

## Faza 2 — Wallet/Postavke izvora: `is_business` toggle

1. **`CustomPaymentSourceDialog`** (dodaj/uredi izvor)
   - Novi switch: "Poslovni izvor" (i18n `wallet.source.isBusiness`)
   - Mali opisni tekst: "Transakcije s ovog izvora bit će označene kao poslovne"

2. **Vizualno na kartici izvora** (Wallet, Dashboard listing)
   - Ako `is_business`: mali 🏢 badge u kutu + suptilni teal border-left

3. **`useCustomPaymentSources`** — već vraća sve, samo dodajemo `is_business` u tip

---

## Faza 3 — Filter chip "Sve / Osobno / Poslovno"

1. **Novi context**: `WalletViewModeContext`
   - `mode: 'all' | 'personal' | 'business'`
   - Persistira u localStorage
   - Mountan globalno (u `App.tsx`)

2. **Novi reusable komponent**: `WalletViewModeChips`
   - 3 chip-a, teal aktivni, mobile-friendly (44px touch)
   - Mountan na vrhu: Dashboard, Wallet, Transactions, Recurring, Reports

3. **`useExpenseFetch`** — refaktor:
   - Ukloni `activeBusinessProfileId` filter granu
   - Dodaj filter prema `mode`:
     - `all` → sve transakcije
     - `personal` → samo s izvora gdje `is_business = false`
     - `business` → samo s izvora gdje `is_business = true`
   - Resolve `is_business` po `payment_source_id` mapi

4. **`useExpenseCRUD`** — refaktor:
   - Ukloni automatsko dodavanje `business_profile_id`
   - Skener i ručni unos rade isti flow

5. **Svi ostali hookovi** koji su filtrirali po `business_profile_id`:
   - `useRecurringTransactions`, `useCalendarEvents`, `useProjects`, `useProjectEstimates`, `useProjectMembers`, `useFinancialAssistant`, `useCustomPaymentSources`, `useBusinessDebts` (briše se)
   - Refactor: filtriraju po `mode` + `is_business` izvora

---

## Faza 4 — Brisanje business UI/koda

**Brišu se datoteke:**
- `src/pages/Business.tsx`
- `src/components/business/` (cijela mapa: BusinessBottomNav, BusinessDashboard, BusinessTransactions, BusinessReports, BusinessMore, BusinessWallet, BusinessProfileView, BusinessRecurring, BusinessProjects, BusinessDebtTracker, BusinessModuleSettings, ProjectStatusBoard, LoanDetectionDialog ako je business-only)
- `src/components/BusinessProfileSwitcher.tsx`
- `src/components/BusinessProfileDialog.tsx`
- `src/components/guards/BusinessModeGuard.tsx`
- `src/hooks/useBusinessDebts.ts`
- `src/types/businessDebt.ts`

**Refaktoriraju se:**
- `src/App.tsx` — ukloni `/business` rutu i lazy import
- `src/pages/Index.tsx` — ukloni `isBusinessMode`, `businessTab`, `businessProfile` state i sve grananje; mounta normalan dashboard uvijek
- `src/components/BottomNav.tsx` — ukloni business stavku ako postoji
- `src/contexts/AppStateContext.tsx` — ukloni `businessFeatureEnabled`, `businessModeEnabled`, `activeBusinessProfileId` polja, settere, localStorage ključeve
- `src/components/settings/SettingsDialog.tsx` — ukloni Business mode toggle + module postavke
- `src/components/NotificationsDropdown.tsx`, `src/components/TransactionItem.tsx`, `src/components/CSVImportDialog.tsx`, `src/components/BankConnection.tsx`, `src/components/DetectedPartnersDialog.tsx`, `src/components/add-expense/*`, `src/components/projects/*` — ukloni `business_profile_id` reference
- `src/lib/dataExportZip.ts`, `src/lib/ownerLoanLogic.ts` — ukloni business export grane
- `src/pages/JoinProject.tsx` — ukloni business kontekst kod prihvata

**i18n** (hr/en/de):
- Ukloni `business.*` ključeve koje koriste samo obrisane komponente
- Dodaj `wallet.source.isBusiness`, `wallet.viewMode.{all,personal,business}`, badge labele

**Memorija:**
- Briše se / arhivira: `business-mode-isolation`, `business-visibility-logic`, `business-profile-management`, `business-receipt-scanning-v2`, `dual-level-project-system` (bar dio o modu), `business-debts...` (debts memorija)
- Dodaje se nova memorija: `wallet-business-flag-and-view-mode`

---

## Faza 5 — Edge functions cleanup

Pregled i čišćenje funkcija koje primaju `business_profile_id`:
- `parse-receipt`, `analyze-document`, `categorize-transaction`, `match-recurring`, `notify-project-transaction`, `notify-payment-source-transaction`, `financial-assistant`, `detect-loans`

Za svaku: ukloni parametar i bilo koji business-only flow. Funkcije nastavljaju raditi identično za personal flow.

---

## Faza 6 — QA checklist (prije produkcije)

- [ ] Dashboard otvara s pamćenim filterom
- [ ] Filter "Sve" prikazuje sve transakcije i sve izvore
- [ ] Filter "Osobno" sakriva poslovne
- [ ] Filter "Poslovno" sakriva osobne
- [ ] Wallet stanje sumira samo prikazane izvore
- [ ] Skener radi i kreira transakciju koja nasljeđuje is_business po izvoru
- [ ] Recurring radi za oba tipa
- [ ] Izvještaji nude opciju filtera
- [ ] Projekti i budžeti rade neovisno (nema regressije)
- [ ] Notifikacije rade
- [ ] CSV import radi (bez business kolone)
- [ ] Mobilni layout 384px ✓ touch targets 44px ✓
- [ ] i18n HR/EN/DE prevedeno
- [ ] Sentry: nema novih grešaka prvi sat nakon deploya

---

## Tehnički detalji

**Filter logika u `useExpenseFetch`:**
```ts
const sourceMap = useMemo(() => {
  const m = new Map<string, boolean>(); // sourceId -> is_business
  paymentSources.forEach(s => m.set(s.id, !!s.is_business));
  return m;
}, [paymentSources]);

const filteredByMode = useMemo(() => {
  if (mode === 'all') return expenses;
  return expenses.filter(e => {
    const sid = e.income_source_id?.replace('custom:', '');
    if (!sid) return mode === 'personal'; // legacy / no source = personal
    const isBus = sourceMap.get(sid) ?? false;
    return mode === 'business' ? isBus : !isBus;
  });
}, [expenses, sourceMap, mode]);
```

**Redoslijed izvršenja (sigurnost):**
1. Faza 1A (ADD COLUMN) → push
2. Faza 2 (UI za toggle) → push, ti označiš svoje izvore kao poslovni/osobni
3. Faza 3 (filter sustav) → push, testira se
4. Faza 4 (brisanje business UI) → push
5. Faza 5 (edge functions) → push
6. Faza 1B (DROP business stupaca/tablica) → push
7. Faza 6 (QA + produkcija)

Svaka faza je samostalna i može se rollbackati Lovable History gumbom.

---

## Rizik

**Niski**, jer:
- 0 produkcijskih korisnika s business podacima (potvrđeno)
- Filter logika je dodatak, ne zamjena dok se postojeći kod ne ukloni
- Brisanje business stupaca tek na kraju, kad ih više ništa ne piše
- 7 koraka, svaki rollback-able

Reci "kreni" i počinjem s Fazom 1A (ADD COLUMN), nakon što potvrdiš da su brojači 0.
