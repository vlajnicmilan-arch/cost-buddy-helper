## Uzrok

AI PDF parser je interne prijenose (top‑up Aircash računa preko INA/Tisak gotovinom **i** preko kartica tipa "Uplata na Aircash - Visa *** 7262") klasificirao kao `expense` umjesto `transfer`.

Postojeći safety net `reclassifyInternalTransfers` u `src/lib/pdfPostProcess.ts` pokriva samo `income → transfer`. Ne hvata `expense → transfer`, pa su top‑upovi završili kao isplate i napuhali rashode.

Ključne riječi za sve te slučajeve ("uplata na aircash", "uplata gotovine", "uplata na aircash - visa ...", "aircash top up", "nadoplata aircash", "bankomat", "atm withdrawal", "prijenos na vlastiti račun"…) već postoje u `isInternalTransfer()` u `src/lib/csvParsers.ts`. Promjena je samo u grani koja te keywordse primjenjuje i na `expense`.

## Promjena 1 — proširi safety net (kod)

`src/lib/pdfPostProcess.ts`:

- Trenutno: `if (tx.type !== 'income') return tx;`
- Novo: obraditi i `income` i `expense`. Ako opis match‑a `isInternalTransfer(desc)`, pretvori u `transfer`.
- `transfer` ostaje netaknut (AI ga već dobro pohvata).
- Ostali tipovi (npr. `correction`) ostaju netaknuti.

Zašto je sigurno proširiti i na `expense`: svi keywordsi u `isInternalTransfer` su definicijski interni prijenosi (top‑up Aircash/Revolut, ATM, prijenos na vlastiti račun). Klasifikacija `transfer` je točna bez obzira gleda li se iz source ili destination kuta.

## Promjena 2 — regresijski testovi

`src/lib/__tests__/pdfPostProcess.test.ts` — dodaj:

- "Uplata gotovine na Aircash INA" + `expense` → `transfer`
- "Uplata gotovine na Aircash Tisak" + `expense` → `transfer`
- "Uplata na Aircash - Visa *** 7262" + `expense` → `transfer`
- "Bankomat podizanje 100 EUR" + `expense` → `transfer`
- Regular expense ("Konzum Maksimirska") + `expense` → ostaje `expense`
- Postojeći income → transfer testovi i dalje prolaze

## Promjena 3 — recovery svibanj/lipanj (opcija A, kako si izabrao)

1. Korisnik u Wallet listi filtrira Aircash + razdoblje svibanj/lipanj 2026.
2. Briše krive expense retke (Trash + UNDO ostaje sigurnosna mreža).
3. Ponovi PDF uvoz istog izvoda — nakon Promjene 1 svi top‑upovi (i gotovinski i kartični) automatski postaju `transfer`.

Bez bulk SQL update‑a — pravilan `transfer` zahtijeva i postavljanje destinacije (`income_source_id` = Aircash payment source), što je urednije napraviti kroz import flow nego u sirovom SQL‑u.

## Što NE radim

- Ne diram AI prompt (keyword safety net je deterministički, jeftiniji, pokriven testovima).
- Ne diram CSV parser (Aircash CSV već koristi istu `isInternalTransfer` listu i radi ispravno).
- Ne uvodim novu heuristiku temeljem +/- predznaka — AI parser ne izlaže sirovi predznak, samo izračunati `type`.
- Ne radim memory update do nakon implementacije; ako prođe, ažurirat ću postojeći mem `pdf-import-internal-transfer-reclassification` da uključuje i expense granu.

## Validacija

- `npm test` mora proći (postojeći + 4 nova testa).
- Ručni smoke: korisnik briše krive transakcije, ponovo uveze isti PDF, provjeri da su top‑upovi u Wallet listi prikazani kao Transfer (gotovina/Visa → Aircash) i da Aircash saldo + ukupan rashod za svibanj/lipanj pada na očekivanu razinu.
