## Cilj

Pokriti sve nedostatke prijevoda u aplikaciji u 3 faze. Korisnik vidi probleme u dijaloškim ekranima — ti su u Fazi 1 (najveći utjecaj, mali rizik).

## Opseg (utvrđeno auditom)

- 13–21 strukturno nedostajućih ključeva (uglavnom `projects.documents.*`, `projects.tabs.*`, `projects.tooltips.*`)
- ~55 ključeva s identičnom HR/EN/DE vrijednosti koje treba prevesti (isključujući brand imena: Revolut, Aircash, Cloud, Profit, Status…)
- 137 hardcodiranih HR stringova u JSX tekstu
- 43 hardcodirana atributa (placeholder/aria-label/title)
- 69 hardcodiranih toast/showError poruka

## Što se NE dira

- `src/pages/PrivacyPolicy.tsx`, `Impressum.tsx`, `Unsubscribe.tsx`, `TermsOfService.tsx` — pravni HR dokumenti
- Brand imena i identifikatori (Revolut, Aircash, Cloud, IBAN, OIB)
- Komentari u kodu (uvijek engleski, po projektnoj konvenciji)

---

## Faza 1 — Dijaloški ekrani i česti UI (najveći vidljivi efekt)

**Komponente:**
- `RecategorizeDialog.tsx` (5 stringova)
- `FinancialAssistantDialog.tsx` (3)
- `BankConnection.tsx` (3)
- `PaymentSourceTransactionsDialog.tsx` (3)
- `recurring/RecurringMatchDialog.tsx` (2)
- `BulkEditDropdown.tsx` (2)
- `DetectedPartnersDialog.tsx` (1)
- `ScanningOverlay.tsx` (1)
- `ErrorBoundary.tsx` (2)
- `add-expense/ManualExpenseForm.tsx` (2)
- `recurring/*` i `reports/*` (4)
- Strukturno nedostajući `projects.documents.*` i `projects.tabs.*` ključevi (sva 3 jezika)

**Pristup:**
1. Dodati nove ključeve u sva 3 lokala (HR/EN/DE) pod logičnim namespace-om (npr. `dialogs.financialAssistant.*`, `dialogs.recategorize.*`)
2. Zamijeniti hardcoded strings s `t('…')` pozivima
3. Atribute (placeholder/aria) prevesti istom logikom
4. Verifikacija: pokrenuti audit skriptu ponovo, build + smoke check

## Faza 2 — Toast/showError poruke (69 mjesta)

- Mnoge već koriste `friendlyError` / `tr()` helper (vidi memory: Error Localization)
- Preostale prebaciti u `errors.*` namespace prema postojećoj strukturi
- Posebno hookovi (`useExpenseCRUD`, `useBudgets`, `useProjects`…) i edge function pozivi
- Ovo je rizičnije jer dira poslovnu logiku — radi se file-by-file s commit-after-each

## Faza 3 — Admin paneli i rubni ekrani

- `admin/UsersTab.tsx`, `PushLogsTab.tsx`, `FeedbackInboxTab.tsx`, `BillingTab.tsx`, `APKManagerTab.tsx` (16 stringova)
- `JoinFamily.tsx`, `JoinProject.tsx`, `PublicProject.tsx` (10)
- `Auth.tsx` (2)
- Ostali rijetko viđeni dijalozi

Admin paneli su vidljivi samo adminu — niži prioritet.

---

## Tehnički detalji

- Lokacije: `src/i18n/locales/{hr,en,de}.json`
- Dodavati ključeve sva tri jezika ISTOVREMENO da audit ostane čist
- Koristiti `useTranslation` hook (već postoji u svim relevantnim komponentama)
- Za pluralizaciju (`_few`, `_other`) slijediti postojeći obrazac u `projects.health.*`
- Prije svake faze: `node /tmp/i18n_audit.mjs` (ostavit ću skriptu) → snimiti baseline; nakon faze → potvrditi smanjenje

## Što tražim od tebe prije implementacije

1. **Krećemo s Fazom 1?** (najveći vidljivi efekt, 1 commit, ~30 stringova × 3 jezika)
2. Ili želiš **sve 3 faze odmah** u jednom velikom commitu? (rizičnije, ali iscrpno)
3. Posebno za toast/error poruke: koristim već postojeći `errors.*` namespace ili dodajem nove podgrupacije gdje treba?
