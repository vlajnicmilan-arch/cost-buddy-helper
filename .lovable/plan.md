# F2 — Prekidač „Predajem ulazne račune knjigovođi" (po tvrtki)

Cilj: priprema za knjigovođu (F1 blok kategorije) vidi se samo za tvrtke kojima je vlasnik uključio predaju računa knjigovođi. Isključeno = kao da pripreme nema.

## 1. Baza (additivna migracija)

`business_profiles` dobiva jedan stupac:

- `accounting_handover_enabled boolean NOT NULL DEFAULT false`

Bez rušenja, bez preimenovanja, bez promjene tipova. Postojeće RLS politike na `business_profiles` pokrivaju novi stupac (vlasnik čita/piše svoj profil) — nove politike se ne dodaju.

## 2. Prekidač u postavkama tvrtke

Mjesto: postojeći ekran „Podaci o tvrtki" (`BusinessProfileView`, otvara se iz Poslovno → Više → Podaci o tvrtki).

Nova kartica na dnu, ispod „Kontakt", u istom rukopisu kao ostale kartice:

- naslov kartice: „Knjigovodstvo"
- redak s `Switch`: „Predajem ulazne račune knjigovođi" + kratak opis „Kad je uključeno, na ulaznim računima ove tvrtke prikazuje se knjigovodstvena kategorija."

Prekidač radi neovisno o „Uredi" načinu — jedan dodir odmah sprema (`update` na `business_profiles`), jer nije tekstualno polje. Nakon uspjeha `showSuccess`, lokalno stanje se osvježava.

## 3. Uvjet vidljivosti F1 bloka

Mjerodavna tvrtka računa = `invoice.business_profile_id`, a ako ga nema — `business_profile_id` pripisanog projekta (isto pravilo kao F1).

U `src/lib/eracun/accountingClassification.ts` dodaje se čista funkcija:

- `resolveInvoiceBusinessProfileId(invoice, projects)` — izdvaja već postojeću logiku odabira mjerodavne tvrtke (koristi je i `deriveMaterialExpenseFlag`, bez promjene ponašanja),
- `isAccountingHandoverInvoice(invoice, projects, profiles)` — `isAccountingRelevantInvoice(...) && profiles.find(mjerodavna)?.accounting_handover_enabled === true`.

`isAccountingRelevantInvoice`, `suggestAccountingCategory` i `deriveMaterialExpenseFlag` zadržavaju postojeće potpise i ponašanje — prekidač je dodatni sloj iznad, ne izmjena F1 logike.

U `InvoiceRow.tsx`: cijeli F1 blok (Select kategorije, izbornik projekta, značka „materijalni trošak") renderira se samo kad `isAccountingHandoverInvoice` vrati `true`. Sve ostalo u retku ostaje nepromijenjeno.

## 4. Čitanje postavke na mjestu prikaza

`IncomingInvoicesPanel` već dohvaća profile kroz `useBusinessProfiles()`. Taj hook se dopunjuje: `select` dobiva `accounting_handover_enabled`, a `BusinessProfileLite` novo polje istog imena. Panel ga prosljeđuje u `InvoiceRow` kroz postojeći prop `businessProfiles` (proširen tip), bez novog dohvata i bez novog hooka.

## 5. Utjecaj na oba puta

- **Polica ulaznih računa** (`IncomingInvoicesPanel` → `InvoiceRow`): jedino mjesto gdje F1 blok postoji — uvjet djeluje ovdje.
- **Pregled iz maila**: provjereno pretragom — knjigovodstvena kategorija se nigdje u mail pregledu ne prikazuje (jedini kod izvan police je neobavezno polje `accounting_category` koje `parse-receipt` vraća kao prijedlog). Mail put se ne dira; kad jednom dobije prikaz kategorije, koristit će istu funkciju `isAccountingHandoverInvoice`.

## 6. Greške

Pad upisa ili čitanja postavke: zapis u `app_diagnostics_logs` kroz postojeći `logDiagnostic` — radnja (`business_profiles.setAccountingHandover`), `business_profile_id`, doslovni `code`/`message` iz baze, build žig; korisniku prevedena poruka kroz `describeDbError` (nikad generička). Ako je upis prošao a osvježenje palo, poruka izričito kaže oboje.

## 7. Prijevodi i testovi

hr/en/de ključevi: `business.accounting.handoverTitle`, `business.accounting.handoverLabel`, `business.accounting.handoverDesc`, `business.accounting.handoverSaveFailed`, `business.accounting.handoverSavedRefreshFailed`.

Testovi (vitest): `isAccountingHandoverInvoice` — tvrtka s uključenim prekidačem → true; ista tvrtka isključeno → false; račun bez tvrtke ali s poslovnim projektom čija tvrtka ima prekidač → true; osobni račun → false; nepoznata tvrtka → false. Plus izvorni čuvar da `InvoiceRow` blok stoji iza tog uvjeta.

## Dirnute datoteke (predviđeno)

- nova migracija u `drizzle/migrations/` (+ regeneriran `types.ts` alatom)
- `src/components/business/BusinessProfileView.tsx`
- `src/hooks/useBusinessProfiles.ts`
- `src/lib/eracun/accountingClassification.ts`
- `src/components/business/eracun/IncomingInvoicesPanel.tsx` (prosljeđivanje polja)
- `src/components/business/eracun/InvoiceRow.tsx` (uvjet oko F1 bloka)
- `src/i18n/locales/hr.json`, `en.json`, `de.json`
- `src/test/accountingClassification.test.ts` (+ po potrebi novi test)

## NIJE dirano

Mjesečni pregled/paket (B), zip originala i čišćenje slike (C), mail knjigovođi; logika kategorije i „materijalni trošak" iz F1; motor salda i anchor; `expenses` i put spremanja troška; uvoz izvoda, dedup/otisak; owner-loan; RLS politike; scanner tijek; atribucija troška; `client.ts`. Ne objavljuje se.
