## Što sam provjerio

- U bazi postoje 2 novija import batcha za istog korisnika:
  - svibanj: 46 aktivnih `bank_only` redova
  - lipanj: 52 redova ukupno, od toga 47 `bank_only`, 5 `confirmed`, 7 obrisanih transfera
- Screenshot pokazuje gumb `Uvezi 47 transakcija` jer UI računa: `unique + autoMerge + review-merge/new`, a ne prikazuje jasno koliko je stvarno novo, koliko će se spojiti, a koliko će se preskočiti.
- `imported_statements` nema zapis za ta 2 nova batcha (`rows_with_recent_batch_not_recorded = 121`) jer se u `recordImportedStatement` šalje `import_batch_id: null`. Zato zaštita “ovaj izvod je već uvezen” ne može pouzdano zaustaviti ponovni uvoz istog izvoda.
- Row-level dedup postoji (`uniq_expenses_user_bank_tx`), ali fingerprint uključuje `type` i opis/merchant. Nakon promjene `expense -> transfer`, isti PDF može dobiti drugačiji fingerprint za iste stvarne transakcije. Zato re-import ne prepoznaje sve kao iste redove.
- Auto-merge trenutno radi samo za `income`/`expense`, ne za `transfer`. To objašnjava Aircash dopune/prijenose nakon zadnjeg fixa.

## Plan

1. **Popraviti evidenciju import batcha**
   - `importFromCSV` treba vratiti stvarni rezultat importa: `batchId`, broj umetnutih, broj preskočenih po fingerprintu i broj spojenih.
   - `GlobalPDFImportHost` mora u `recordImportedStatement` upisati stvarni `import_batch_id`, ne `null`.
   - Ako nije umetnut nijedan novi red i sve je preskočeno/spojeno, ne zapisivati lažni “novi izvod”.

2. **Stabilizirati fingerprint za re-import istog izvoda**
   - Za import fingerprint izbaciti `type` iz identiteta ili ga normalizirati tako da `expense/income/transfer` promjena ne mijenja identitet iste stavke.
   - Zadržati `user + payment_source + date + amount + normalized merchant/description` kao osnovu.
   - Dodati regresijske testove: ista Aircash top-up stavka s `expense` i `transfer` mora dati isti fingerprint.

3. **Proširiti auto-merge na transfere**
   - `matchManualToImported` treba podržati `transfer` uz isti princip: isti izvor, isti iznos, ±1 dan, 1:1 kandidat.
   - Query za manual kandidate u `importFromCSV` mora uključiti `transfer`.
   - `findDuplicates` preview mora koristiti istu logiku da korisnik vidi “automatski će se spojiti”, umjesto da se cijeli izvod broji kao novi.

4. **Ispraviti broj u duplicate dialogu**
   - Gumb ne smije govoriti samo `Uvezi 47 transakcija` kad dio redova ide u merge ili će biti preskočen.
   - Prikazati jasne brojeve: `Novo`, `Spojit će se`, `Preskočeno/duplikati`.
   - Tekst mora ići kroz i18n za HR/EN/DE.

5. **Regresijski testovi**
   - `manualMatchForImport`: transfer ↔ transfer se auto-spaja; različit source se ne spaja; više kandidata ostaje ambiguous.
   - `importFingerprint`: promjena `type` ne mijenja fingerprint iste importirane stavke.
   - Po potrebi prilagoditi postojeće testove koji očekuju stari fingerprint format.

6. **Sanacija postojećeg stanja**
   - Ne raditi bulk update/delete bez dodatne potvrde.
   - Nakon code fixa: preporuka je ne klikati `Uvezi 47` na trenutnom dialogu. Zatvoriti ga, ponovno otvoriti PDF import. Novi flow bi trebao prepoznati postojeće redove i/ili jasno pokazati što se spaja.
   - Ako već postoje duplikati nakon pokušaja, napraviti zaseban read-only izvještaj po datumu/iznosu/opisu prije bilo kakvog čišćenja.