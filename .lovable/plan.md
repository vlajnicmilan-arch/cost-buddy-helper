# Program Temelj, korak 4: Obrada — „Mjesečni pogled: gdje curi" (samo plan)

## 1. Što već postoji

| Dio priče | Postoji | Napomena |
|---|---|---|
| Stvarni prihod/potrošnja (isRealSpend/isRealIncome) | Da — `spendClassification.ts` (zrcalo _shared ↔ src) | Izravno se koristi |
| „Nepotrebno" / „Luksuz" za razdoblje | Da — `MarkersOverview` (`sumTaggedSpend`) | Preuzeti komponentu/račun |
| Budžeti po skupini + izvan budžeta | Da — `useBudgets`, `categoryGroupMatch.ts`, budžet upozorenja | Izvan budžeta već postoji kao signal; treba sažetak po skupini |
| Pregled kategorija / izvješća | Da — ReportsDialog, ItemsAnalysisTab | Izvor podataka, ne i gotov „rast" |
| Ponavljajući troškovi | Djelomično — `recurring_transactions`, `useRecurringMatcher`, merchantKey u uvozu | Nema gotovog „mali ponavljajući zbrojeni"; graditi novo, bez AI-ja |
| Pozajmice | Djelomično — `useLoanDetection`, `business_debts` (poslovni) | Osobne pozajmice: provjeriti obuhvat prije gradnje; prva verzija čita što već postoji |
| „Gdje curi" (rast vs prosjek, jedan ekran) | Ne | Novo |

## 2. Pravila računanja (sve kroz isRealSpend/isRealIncome)

- **Ulaz/izlaz/ostalo:** zbroj isRealIncome, zbroj isRealSpend, razlika — za odabrani mjesec, samo aktivni (deleted_at null) retci.
- **Rast u odnosu na prosjek:** za skupinu (i kategoriju) S = potrošnja ovog mjeseca, P = prosjek zadnja 3 puna mjeseca. Prikazati samo ako: P > 0, S > P × 1.25 (rast ≥ 25%) I (S − P) ≥ 20 € (prag da se ne javlja šum sitnih kategorija). Oba praga kao konstante u jednom pomocu, testirane.
- **Ponavljajući mali troškovi (bez AI-ja):** grupiraj po normaliziranom trgovcu — `counterparty_name` (snapshot na expenses) odnosno merchantKey pravilo iz uvoza (`normalizeMerchant`), fallback na normalizirani opis. „Ponavljajući" = isti ključ u ≥ 3 od zadnja 4 mjeseca, s ≥ 2 zapisa po mjesecu ili stabilnim iznosom (odstupanje ≤ 20%). Prikaz: zbroj ovog mjeseca i godišnja projekcija (mjesečni prosjek × 12). Pretplate iz `recurring_transactions` prikazati u istoj sekciji, označene kao poznate pretplate (ne duplicirati: ako je trgovac već pretplata, jedan redak).
- **Nepotrebno/Luksuz:** postojeći `sumTaggedSpend` za mjesec.
- **Izvan budžeta:** postojeći budžet limiti po skupini (`group:<key>`), stupanj iskorištenja > 100%.
- **Pozajmice:** prva verzija prikazuje ono što već postoji (otvorene pozajmice iz postojeće logike); ako osobne pozajmice nemaju pouzdan izvor, sekcija se ne prikazuje — bez nagađanja.

## 3. Gdje živi

**Nova stranica `/obrada` (radni naziv „Mjesečni pogled"), mobilni prikaz prvi (384px), lazy-loaded ruta.** Ne kartica na Početnoj: Početna već nosi saldo i uvide; Obrada je namjerni „kraj mjeseca" pogled s vlastitim ulazom (Početna dobiva samo karticu-poziv „Pogledaj mjesec" koja vodi na stranicu). Ne dio ReportsDialoga: dijalog je alat za tablice/izvoz, Obrada je priča u jednom ekranu.

Struktura ekrana (sekcije, svaka sklopiva): Sažetak (ušlo/izašlo/ostalo) → Gdje curi (rastuće skupine) → Ponavljajući → Nepotrebno/Luksuz → Izvan budžeta → Pozajmice.

## 4. Performanse

- Milan: 2.412 zapisa ukupno, 2.096 aktivnih, ~2.400 u 12 mjeseci — mali obujam.
- **Zbrojevi na klijentu**, nad već učitanim troškovima (isti dohvat koji hrani izvješća; po potrebi proširiti na 4 mjeseca unatrag — jedan upit, indeks po (user_id, date) već postoji). Bez nove SQL funkcije: sva pravila su čisti helperi u `src/lib/obrada/` (testabilni, bez Reacta), analogno `importReview/state.ts`.
- Rizik rasta obujma: ako netko prijeđe ~20 tisuća redaka, prelazak na SQL funkciju je kasniji nalog — helperi su već odvojeni pa se izvor podataka lako zamjenjuje.

## 5. Poslovni i projektni način

**Samo osobni u prvoj verziji.** Poslovni način ima vlastita izvješća i P&L; miješanje bi zamutilo pravila (projekti, faze, PDV). Stranica se u poslovnom načinu ne nudi. Kasniji nalog po potrebi.

## 6. Testovi, nalozi, rizici

- **Testovi (vitest, pravi oblik podataka):** helperi s redcima kakve vraća baza (type, expense_nature, deleted_at, counterparty_name, currency): isRealSpend filtriranje; pragovi rasta (25% + 20 €, rubni slučajevi: P=0, točno na pragu); ponavljajući (3/4 mjeseca, odstupanje iznosa, dedup s pretplatama); zbrojevi mjeseca; prazno stanje. Postojeći `spendClassification.test.ts` ostaje zelen.
- **Migracije:** nijedna.
- **Nalozi:** 2 — (1) helperi + stranica + ulaz s Početne + prijevodi hr/en/de; (2) sekcija pozajmica ako izvor bude pouzdan, inače izostaje.
- **Rizici:** lažni „rast" kod neredovitih kategorija (ublaženo dvostrukim pragom); trgovac bez counterparty_name na starim ručnim unosima (fallback na opis, prihvatiti nepotpunost); brojke se moraju poklapati s izvješćima — isti isRealSpend izvor to jamči.

## Otvorena pitanja za vlasnika

1. Pragovi rasta (25% i 20 €) — prihvatljivi za prvu verziju?
2. Sekcija pozajmica: prikazati samo ako postoji pouzdan izvor, ili izostaviti do posebnog naloga?
