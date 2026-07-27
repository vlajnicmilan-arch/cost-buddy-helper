
## Cilj

Klijentski PDF izvještaj Krug settlementa za odabrani period: koristi postojeći `pdfReportKit`/`pdfBranding` sloj (isti kao `projectFinancePdfExport.ts`), reuse-a postojeće hookove za podatke, dodaje jedan novi period-scope read za override povijest.

**Nula backend izmjena.** `touches_balance=false`. Nula edge funkcija. Nula migracija.

---

## 1. Novi klijentski modul — `src/lib/krugSettlementPdf.ts`

**Signatura (jedina javna funkcija):**
```ts
exportKrugSettlementPdf(input: {
  krugName: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  language: 'hr' | 'en' | 'de';
  preview: SettlementPreview;                  // iz useKrugSettlement
  ledger: KrugSettlementLedgerRow[];           // iz useKrugSettlementLedger
  overrides: OverrideHistoryRow[];             // iz novog useKrugPeriodOverrides (v. §3)
  nameFor: (uid: string) => string;            // iz useUserProfiles + getMemberDisplayName
  mode?: ExportMode;                           // 'download' | 'open'
}): Promise<void>
```

**Struktura, redom, na Variant B brand kartici (`drawReportHeader`/`drawReportFooter`):**

1. **Header card** — naslov `t('krug.settlement.pdf.title')`, subtitle `${krugName} · ${periodLabel}`, owner + confidentiality iz `resolveBrand` obrasca (kopirati iz `projectFinancePdfExport.ts`).
2. **Meta strip** (mala tablica, brandAutoTable): `display_currency`, FX source (`preview.fx.source`), snapshot date (`preview.fx.snapshot_date`), `frozen` flag (badge iz C1: "🔒 zamrznut" ili "⟳ uživo"). Flag-ovi iz `preview.flags` (mixed_currencies, manual_mode_fallback_equal, missing_income_data) prikazani kao warning trake pomoću `pdfReportKit` (ako trake postoje; inače tekst).
3. **Tablica članova** (`brandAutoTable`): kolone [Član, Plaćeno, Duguje, Neto], sortirano po `nameFor`. Formatirano `fmt(n, preview.display_currency)`.
4. **Tablica transfera**: kolone [Od, Prima, Iznos, Valuta]. Ako je `transfers` prazan → prikaz `t('krug.settlement.pdf.balanced')`.
5. **Timeline podmirenja** (`ledger`): kolone [Datum, Od, Prima, Iznos, Napomena, Status]. Voidani retci označeni tekstom `[✕ ${void_reason}]`. Sortirano `marked_at ASC`. Skrivaj sekciju ako je `ledger.length===0`.
6. **Override povijest** (v. §3): za svaki `krug_expense_split_override` u periodu (status `potvrdjena` ili `povucena`/`odbijena` s activated_at≠null), zaglavlje po trošku (`expense.description · date · amount currency`), zatim ispod:
   - **Podjela**: član → postotak (`share_percent`).
   - **Predložio**: `nameFor(proposed_by)` na `created_at`.
   - **Potvrdili**: lista `nameFor(user_id) · confirmed_at`.
   - **Status**: `potvrdjena`/`povučena`/`odbijena` (+ `reject_reason` ako postoji).
   Ako je lista prazna → `t('krug.settlement.pdf.overridesNone')`.
7. **Footer** — `drawReportFooter` (page X of Y, intended-for).

**Izlaz**: `exportPDFDoc(doc, buildReportFileName('krug-settlement', krugName, periodStart), mode)` — konzistentno s ostalim izvoznicima.

**Nula toucha balance/DB write. Nula HTTP izlaska iz PDF modula.**

---

## 2. Reuse hookova (bez izmjena)

- `useKrugSettlement({krugId, periodStart, periodEnd})` — daje `preview` (members/transfers/fx/flags). **Bez izmjene.**
- `useKrugSettlementLedger(krugId, enabled)` — daje `ledger`. **Bez izmjene.**
- `useUserProfiles(memberIds)` + `getMemberDisplayName` — daje `nameFor`. **Bez izmjene.**

---

## 3. Novi period-scope override hook — `src/hooks/useKrugPeriodOverrides.ts`

**Zašto novi hook:** postojeći `useKrugExpenseOverride(expenseId)` je per-expense (troši 1 upit po trošku). PDF treba sve overridee u periodu odjednom.

**Zašto NE treba novi RPC:** sve 3 tablice (`krug_expense_split_override`, `_share`, `_confirmation`) imaju `SELECT` RLS policyje za `authenticated` full membere Kruga (potvrđeno pg_policies queryjem). Klijent može čitati direktno kroz Supabase JS klijenta, isti obrazac kao `useKrugExpenseOverride`, samo s drugačijim filterom.

**Signatura:**
```ts
useKrugPeriodOverrides(krugId, periodStart, periodEnd, enabled): {
  data: OverrideHistoryRow[]
}
```

**Implementacija (client-only, 3 selecta):**
1. `krug_expense_split_override` gdje `krug_id=$krugId` AND `created_at BETWEEN periodStart AND periodEnd + interval '1 day'` (grubi filter — bolji je join na `expenses.date`, v. dolje).
2. Za dobijene `id`-ove: batch fetch `_share` i `_confirmation` (isti kao u `useKrugExpenseOverride`).
3. Za `expense_id`-ove: fetch minimalnih polja iz `expenses` (`id, description, amount, currency, date`) — filter po `expense_id IN (...)`. Krug expense RLS ionako propušta full membere; dodatno filtriraj klijentski po `expense.date BETWEEN periodStart AND periodEnd` za točan period-scope.

Vraća merged `OverrideHistoryRow[]` sa svime što PDF renderer treba, sortirano po `expense.date DESC`.

---

## 4. UI plumbing — `src/components/krug/KrugSettlementSection.tsx`

- Dodati gumb `<Button variant="outline">` s `Download` ikonom (lucide) u header traku sekcije, uz postojeći `Settings2` (owner) — vidljiv **svim punopravnim članovima**, ne samo owneru (izvještaj je legitimno svih).
- On-click:
  1. Osigurati da su `preview`, `ledger`, `overrides` fetchani (`ledger` je lazy iza `open` togglea u `KrugSettlementHistory` — treba dedicirati enable=true unutar section handlera samo za izvoz, ili prefetchati kroz `queryClient.fetchQuery`).
  2. Zvati `exportKrugSettlementPdf(...)`.
  3. Feedback preko `showSuccess`/`showError` (postojeći `useStatusFeedback`).
- Loading state: dok fetch traje, spinner na gumbu (`disabled + Loader2`).
- Non-owner ne vidi `KrugSettlementSettings`, ali vidi izvoz. Neispravni statusi (`isLoading` prevoda `useKrugSettlement`, `isError`) — gumb disabled.

**Nula izmjena** u `KrugSettlementHistory.tsx`, `KrugSettleTransferDialog.tsx`, mutation hookovima.

---

## 5. i18n — nova grana `krug.settlement.pdf.*`

**hr / en / de** ključevi u `src/i18n/locales/{hr,en,de}.json`:
- `krug.settlement.pdf.title` — "Krug settlement izvještaj"
- `krug.settlement.pdf.exportButton` — "Izvezi PDF"
- `krug.settlement.pdf.periodLabel`, `krug.settlement.pdf.displayCurrency`, `krug.settlement.pdf.fxSource`, `krug.settlement.pdf.fxSnapshotDate`, `krug.settlement.pdf.fxFrozen`, `krug.settlement.pdf.fxLive`
- `krug.settlement.pdf.membersHeader` + kolone `member/paid/owed/net`
- `krug.settlement.pdf.transfersHeader` + kolone `from/to/amount/currency`, `krug.settlement.pdf.balanced`
- `krug.settlement.pdf.timelineHeader` + kolone `date/from/to/amount/note/status`, statusi `settled/voided`
- `krug.settlement.pdf.overridesHeader`, `krug.settlement.pdf.overridesNone`, poljski `proposedBy/confirmedBy/status`, statusi `potvrdjena/povucena/odbijena`
- `krug.settlement.pdf.flags.mixedCurrencies`, `krug.settlement.pdf.flags.manualFallback`, `krug.settlement.pdf.flags.missingIncome`
- `krug.settlement.pdf.filenameBase` — "krug-settlement"

Ključ `settings.notifKrug.settlement.pdf.title` (isti "Krug settlement" u sva 3 jezika) → dodati u `untranslatedLocaleWhitelist.ts` ako test padne (kao što je bio slučaj s `settings.notifKrug` u C2).

---

## 6. Testovi

- Nova unit datoteka `src/lib/__tests__/krugSettlementPdf.test.ts` — testira pure helper funkcije (formatiranje transfera, grouping override rowova po expense), stubira jsPDF preko `vi.mock('@/lib/loadJsPdf')`. Ne renderira stvarni PDF u testovima.
- Postojećih 2092 testova mora ostati zeleno (nula regresija — sve promjene su aditivne).

---

## 7. Nula-toucha lista

- Nula izmjena `expenses`, `custom_payment_sources`, balance triggera, anchor stack.
- Nula izmjena `krug_mark_settled`, `krug_settlement_preview`, `krug_freeze_fx_snapshots_monthly`, override RPC-ova.
- Nula novih edge funkcija.
- Nula migracija (potvrđeno: sve 3 override tablice + ledger + preview imaju sve što treba za klijentski read).
- Nula izmjena balance/settlement engine logike.
- C4 (SQL invarijante) ostaje izvan opsega — čeka odobrenje.

---

## 8. Verifikacija prije commita (kad Milan kaže "gradi C3")

1. Vitest 2092+ testova PASS.
2. Manualni klik u browseru: gumb "Izvezi PDF" na testnom Krugu → PDF se skida, sadrži header, članove, transfere, timeline i override sekciju.
3. PDF QA (per PDF skill): renderirati stranice pomoću `pdftoppm`, provjeriti overlap, cut-off, font glyphove (naročito ć/š/đ/ž — koristiti `applyBrandFont` koji već rješava Unicode za Croatian).
4. `touches_balance` DB provjera (dat će Milan) — mora ostati `false`.

---

## Otvorena pitanja (odgovoriti prije "gradi")

1. **Override scope u periodu**: filter po `expenses.date` (kad se trošak dogodio) ili po `override.created_at` (kad je prijedlog nastao)? Prijedlog: **`expenses.date`** (semantički odgovara periodu izvještaja; poklapa se s onim što settlement preview uzima u obračun). Ako Milan želi drugačije — javiti.
2. **Odbijeni prijedlozi (`odbijena`, `povucena`)**: uključiti ih u override povijest ili samo `potvrdjena`? Prijedlog: **uključiti sve non-pending** (transparentnost governancea — ionako je to point Faze B). Ako Milan želi samo aktivne — javiti.
3. **PDF file naming**: `krug-settlement__${krugSlug}__${YYYY-MM}.pdf` (koristeći `buildReportFileName`)?
