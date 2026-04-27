Prvo: imaš pravo biti ljut. Pregledao sam stvarne logove, ne samo kod, i pronašao konkretan problem: backend skeniranje računa je 27.04. u 16:56 i 16:57 uspješno pročitalo račun iz poslovnih financija, uključujući iznos 72.89, trgovca, datum, artikle i PDV. Ali nakon toga nema nijednog `expense_insert_attempt` zapisa i nema spremljene transakcije u zadnja 2 sata. To znači da AI skener nije pao na čitanju računa; tok se prekida između prikaza rezultata i spremanja / prihvaćanja rezultata u aplikaciji.

Plan popravka:

1. Popraviti spremanje skeniranog poslovnog računa
   - U `src/hooks/useExpenseCRUD.ts` dodati spremanje `vat_rate` i `vat_amount` u `expenses` insert payload.
   - Trenutno `AddExpenseDialog` pripremi PDV podatke, ali CRUD insert ih ne šalje u bazu, pa se poslovni dio ponaša kao da dio skenera “ne radi”.
   - U `src/types/expense.ts` dodati `vat_rate` i `vat_amount` u `Expense` tip da se podaci dosljedno nose kroz aplikaciju.

2. Popraviti prijenos podataka iz AI rezultata u preview
   - U `src/components/add-expense/AddExpenseDialog.tsx` proširiti `applyScannedResult()` da ne izgubi `issuer_name`, `issuer_oib`, `vat_rate` i `vat_amount`.
   - Dodati fallback za `description`: ako AI vrati `null` (što se upravo dogodilo u logu), opis će automatski biti trgovac/izdavatelj, a ne prazna vrijednost.

3. Učiniti poslovni skener direktnim, a ne skrivenim iza “Novo”
   - U `src/components/business/BusinessTransactions.tsx` dodati zaseban gumb “Skeniraj” uz postojeći “Novo”.
   - U `src/pages/Business.tsx` voditi dva načina otvaranja dijaloga: ručni unos i auto-scan.
   - Kad korisnik klikne “Skeniraj”, `AddExpenseDialog` se otvara s `autoScan`, kao na početnoj stranici, umjesto da korisnik mora pogoditi da se skener nalazi unutar ručnog dodavanja.

4. Dodati dokazivu dijagnostiku za cijeli sken-flow
   - U `useReceiptScanner.ts` logirati: početak skeniranja, uspjeh AI rezultata, HTTP grešku i prekid.
   - U `AddExpenseDialog.tsx` logirati: prikaz preview-a, klik “Prihvati”, blokadu zbog obaveznih poslovnih polja i pokušaj spremanja.
   - Ovi zapisi neće lomiti aplikaciju, ali će pokazati točno gdje tok staje ako opet ne spremi.

5. Ispraviti lažni “kritično” iz dijagnostike
   - Trenutni Pulse označava sporo učitavanje preview rute kao `warning`, ali korisnički je to prikazano kao katastrofa. Popraviti prikaz/klasifikaciju tako da performance warning ne izgleda kao fatalna greška.
   - Neću skrivati stvarne greške; samo razdvojiti “aplikacija se srušila” od “stranica se sporo učitala”.

6. Provjera nakon izmjena
   - Pokrenuti TypeScript provjeru.
   - Provjeriti da poslovni scan path ima očekivani tok:

```text
Poslovanje -> Transakcije -> Skeniraj
  -> kamera/galerija
  -> AI parse receipt
  -> preview s iznosom, trgovcem, datumom, PDV-om
  -> Prihvati
  -> expenses insert s business_profile_id + vat_rate + vat_amount
  -> transakcija vidljiva u poslovnim financijama
```

Napomena: backend funkcija `parse-receipt` prema logovima radi. Neću dirati AI prompt kao prvi potez jer nije tu puklo. Popravak ide na frontend tok i spremanje rezultata, gdje logovi pokazuju rupu.