## Cilj

Uvoz bankovnog izvoda za tvrtku (Tactura) mora:
1. Prepoznati **sve** transakcije iz HTML/PDF izvoda (datum, opis, iznos, smjer)
2. Sve transakcije vezati na **jedan poslovni izvor plaćanja** (računa tvrtke)
3. Prepoznati uplate vlasnika i među-tvrtkine transfere kao **pozajmice** (smjer iz opisa: "prema tvrtki" ili "od tvrtke")

## Problem (potvrđeno iz logova)

Tvoj zadnji uvoz Erste HTML izvoda za Tactura j.d.o.o. (HR4224020061101288287, 13 KB):
- Gemini vratio **samo 1 transakciju** (naknada 2.57 €) — ostale je pogrešno označio kao salda
- Transakcija završila u Osobnim jer `payment_source='bank'` (legacy) → cross-mode prikaz

## Rješenje — 4 ortogonalne preinake

### A. AI prompt: kolonska logika + jasan opseg
`supabase/functions/parse-pdf-statement/index.ts`

Refaktor system prompta:
- **Jedino pravilo za tip**: iznos u koloni "Uplata/Potražuje/Korist/Credit" → `income`; iznos u koloni "Isplata/Duguje/Teret/Debit" → `expense`. Bez nagađanja po nazivu primatelja.
- **Što JEST transakcija**: svaki red glavne tablice s datumom + iznosom. Uplate vlasnika, povrati poreza, primici od kupaca, transferi između tvrtki — sve uključi.
- **Što NIJE transakcija** (skraćeno na 4 stavke): "Početno stanje", "Konačno stanje", "Promet ukupno (dugovni/potražni)", "Stanje na dan".
- **Posebna grana za HTML**: "Pronađi najveću `<table>` u dokumentu. Svaki `<tr>` u njenom `<tbody>` koji ima datum + iznos je transakcija. Ne preskači nijedan red."
- **Opis transakcije**: zadrži original tekst iz izvoda (uključujući naziv platitelja/primatelja, model i poziv na broj). Bez kraćenja — kasnije nam treba za detekciju pozajmica.
- **Validacija u edge funkciji**: ako AI vrati < 3 transakcije a input > 5 KB, logiraj `WARN: suspiciously few transactions extracted, size=X KB, returned=Y` za debugging.
- **Uklanjamo iz prompta i izlaza**: `payment_source`, `card_type`, `card_last4` — više nisu relevantni jer cijeli izvod ide na korisnički-odabrani izvor.

### B. Forsiranje jednog poslovnog izvora
`src/components/BankConnection.tsx`
- Novi prop `defaultBusinessPaymentSourceId?: string`.
- Kad postoji, override-aj `payment_source = 'custom:<id>'` na **sve** transakcije prije `onImportCSV` poziva (linije 169 i 197).

`src/hooks/usePDFParser.ts`
- Ukloniti `detectPaymentSource` iz mappinga rezultata (klijent više ne nagađa — ili AI ne vraća, ili biznis kontekst override-a).

### C. Wire-up u `BusinessTransactions.tsx`
- Učitati `customPaymentSources` filtrirane po aktivnom `business_profile_id`.
- **Ako tvrtka nema poslovni izvor**: gumb uvoza disabled + warning *"Najprije dodaj poslovni izvor plaćanja (računa tvrtke) za koji uvoziš izvod."* + link "Dodaj izvor".
- **Ako ima točno jedan**: auto-prosljeđivanje `defaultBusinessPaymentSourceId`.
- **Ako ih ima više**: `Select` iznad gumba *"Uvoz se vezuje na izvor:"* (default = prvi po imenu, pamti se zadnji odabir u `localStorage` po `business_profile_id`).
- **IBAN match**: ako parser vrati `account_iban` koji se podudara s nekim postojećim biznis izvorom (po `iban` polju), pre-select taj izvor.

### D. Detekcija pozajmica iz uvoza (već postoji za CSV — proširiti na PDF/HTML)

**Postojeća logika**: `useLoanDetection` se već poziva u `CSVImportDialog.tsx:243-255` nakon uspješnog CSV uvoza u biznis modu. Otvara `LoanDetectionDialog` gdje korisnik potvrdi koje su pozajmice i u kojem smjeru.

**Što fali**: `BankConnection.tsx` (PDF/HTML grana, `handleImportPDFTransactions` linija 140 i `handleConfirmImportWithDuplicates` linija 181) **ne** poziva `detectLoans` nakon uvoza. Treba dodati identičan blok kao u CSV-u:
- Nakon `await onImportCSV(transactions)` u biznis modu
- Pozvati `detectLoans(transactionsForScan)` 
- Ako vrati > 0, otvoriti `LoanDetectionDialog` s detektiranim pozajmicama
- Korisnik bira koje su pozajmice + smjer (vlasnik → tvrtki ili tvrtka → vlasnik)
- Spremaju se u `business_debts` (već postojeći flow preko `addDebt`)

**Detekcija smjera**: `useLoanDetection` već koristi AI s `detect-loans` edge funkcijom koja čita opis i predlaže smjer. Ključne riječi koje već prepoznaje: "uplata osnivača", "pozajmica", "kreditiranje", "povrat pozajmice", ime vlasnika u opisu. Bez izmjena u edge funkciji.

## Što ostaje nepromijenjeno

- `useExpenseCRUD.importFromCSV` — već ispravno postavlja `business_profile_id`. ✓
- `useExpenseFetch.applyViewMode` — kad payment_source bude `custom:<biz-id>`, transakcija će biti **samo** u Tvrtkinom prikazu i utjecati na saldo poslovnog izvora. ✓
- `useLoanDetection` + `detect-loans` edge funkcija + `LoanDetectionDialog` + `business_debts` tablica — postojeći flow se samo proširuje na PDF/HTML.
- Osobni Wallet uvoz — bez promjene (payment_source iz `usePDFParser` ostaje, ali kad ukinemo `detectPaymentSource`, default je `'bank'`).

## QA scenariji

1. **Erste izvod za Tactura, jedan poslovni izvor**:
   - AI izvuče sve transakcije (10+ umjesto 1)
   - Sve idu na "Erste poslovni račun" (Tactura)
   - Pojavljuju se samo u Tvrtkinim transakcijama, saldo Erste izvora se mijenja
   - Nakon uvoza otvori se LoanDetectionDialog za uplate vlasnika i među-tvrtkine transfere
   - Korisnik potvrdi smjer pozajmice → upiše se u `business_debts`
2. **Tvrtka bez poslovnog izvora**: gumb disabled + warning
3. **Dvije tvrtkine kartice**: Select s 2 opcije, IBAN match auto-pre-select

## Što NE radimo

- Bez timeout/guard hackova
- Bez izmjene `useExpenseCRUD.importFromCSV` jezgre
- Bez promjene `business_debts` shema ili RLS-a
- Bez novih AI funkcija (postojeći `detect-loans` je dovoljan)

## Redoslijed implementacije

1. Refaktor system prompta u `parse-pdf-statement` + redeploy
2. Curl test edge funkcije s tvojim Erste HTML uzorkom — provjera broja transakcija
3. `BankConnection` prima `defaultBusinessPaymentSourceId` + `useLoanDetection` poziv nakon uvoza
4. `BusinessTransactions` proslijeđuje izvor (auto / Select / warning)
5. Klijentska sanitizacija u `usePDFParser`
6. i18n ključevi (HR/EN/DE): `import.selectBusinessSource`, `import.noBusinessSourceWarning`, `import.linkedToSource`
7. End-to-end QA na tvom računu (uvoz Erste izvoda za Tactura)
