## Problem

Aircash PDF izvod uvezao je 2 retka "Uplata gotovine na Aircash Tisak" (300 €, 500 €) kao `type: "income"`. Trebali bi biti `type: "transfer"` (cash top-up novčanika). CSV import isto rješava preko `isInternalTransfer()` u `src/lib/csvParsers.ts`, ali PDF flow taj post-processing ne radi i AI prompt ne pokriva ovaj scenarij.

## Cilj

PDF/HTML/foto izvodi konzistentni s CSV importom: cash i wallet top-upovi (Aircash, Revolut, PayPal, Wise, Tisak gotovina, ATM uplata…) završavaju kao `transfer`, ne kao `income`.

## Promjene

### 1. AI prompt (`supabase/functions/parse-pdf-statement/index.ts`)

Proširiti dio "ODREĐIVANJE TIPA" — eksplicitno dodati cash/wallet top-up klasu kao `transfer`:

- Bilo koja "Uplata gotovine na <wallet>" (Aircash, Revolut, PayPal, KeksPay, Wise, Bunq, N26…)
- "Uplata na Aircash", "Top up", "Nadoplata Aircash/Revolut"
- "Uplata gotovine putem Tisak / bankomat / ATM"
- ATM podizanje (već postoji) — zadržati

Primjeri u promptu da Gemini Flash nauči obrazac. Bez mijenjanja sheme, samo dodatak teksta.

### 2. Post-process safety net (`src/hooks/usePDFParser.ts`)

U `toParseResult` i u `parseHTML` mapperu, za svaku transakciju s `type === 'income'` pozvati `isInternalTransfer(description)`. Ako vrati `true` → prepisati `type` u `'transfer'`. Funkcija je već exported iz `src/lib/csvParsers.ts`.

Ovo pokriva i:
- starije AI deploye koji još nisu pohvatali novi prompt
- edge case-ove koje AI promaši
- garantira identično ponašanje s CSV parserima

### 3. Test (`src/lib/__tests__/usePDFParser.test.ts` — novo, samo helper)

Ekstrahirati post-process korak u čistu funkciju `reclassifyInternalTransfers(tx[])` u `src/lib/pdfPostProcess.ts` (per project rule: bug u logici → helper → test) i pokriti vitest-om:
- "Uplata gotovine na Aircash Tisak" income → transfer
- "Uplata na Aircash - Visa *** 7262" income → transfer
- Obična plaća "Plaća za 5/26" income → ostaje income
- Expense retci se ne diraju

## Što NE radim

- Ne diram CSV parser (već radi)
- Ne diram `transferMatching` (druga strana za Tisak cash top-up ionako ne postoji u sustavu)
- Ne radim retroaktivnu migraciju postojećih krivo uvezenih redaka — to ti mogu napraviti zasebnom akcijom (UPDATE za tvoja 2 retka) ako želiš nakon mergea.
- Ne mijenjam shemu, RLS, ni druge edge funkcije.

## Verifikacija

1. `npm test` — novi unit testovi prolaze
2. Re-import istog Aircash PDF-a u preview-u: 2 "Uplata gotovine na Aircash Tisak" prikazuju se s ↔ ikonom i `transfer` tipom u review dialogu prije importa
3. Edge log `parse-pdf-statement` pokazuje da AI sad već vraća `type: "transfer"` (ili da ga safety net prepisuje)

## Otvoreno pitanje za poslije

Trebaš li UPDATE za 2 postojeća retka koja su već uvezena kao income? To mogu pripremiti zasebnim migrationom ili ručno preko `update transaction` UI-a nakon mergea ovog fixa.
