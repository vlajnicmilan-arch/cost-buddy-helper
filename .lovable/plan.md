Imaš pravo: pogrešno sam dirao i opisao PDV. Pregled logova sada pokazuje stvarni prekid:

- `parse-receipt` radi: u 17:15 dva puta je pročitao isti račun, iznos 72.89, trgovac i datum.
- Dijagnostika ima `receipt_scan_success` i `receipt_scan_preview_shown`.
- Nema `receipt_scan_accept_attempt`.
- Nema `expense_insert_attempt`.
- Nema nove transakcije u `expenses` danas nakon skeniranja.

Znači kvar nije u AI čitanju i nije u bazi; tok staje na preview ekranu, prije pritiska/obrade "Prihvati". Također sam potvrdio da je PDV UI i dalje aktivan i da AI prompt i dalje traži PDV, iako je taj modul izbačen. To treba ukloniti, ne popravljati.

Plan popravka:

1. Potpuno ukloniti PDV iz skenera i spremanja
   - Izbaciti `vat_rate` i `vat_amount` iz `Expense` tipa.
   - Izbaciti `vat_rate` i `vat_amount` iz insert payload-a u `useExpenseCRUD.ts`.
   - Izbaciti PDV polja iz `ScannedData` i `ParsedReceipt` tipova.
   - Ukloniti PDV UI blok iz `ScannedDataPreview.tsx`.
   - Ukloniti PDV logiranje (`has_vat`) iz dijagnostike skenera.
   - Ukloniti PDV dio iz `parse-receipt` prompta i response-a da AI više ne troši pažnju na modul koji ne postoji.

2. Popraviti stvarni razlog zašto poslovni sken ne završava spremanjem
   - U `BusinessModeView.tsx` poslovna kartica "Transakcije" trenutno šalje `onAddClick={() => {}}` i nema `onScanClick`, pa je upravo `/home` poslovni tok nedovršen. To odgovara logovima: korisnik je na `/home`, scan se prikaže, ali nema stabilan poslovni save flow.
   - Dodati kontrolirana stanja za ručni unos i skeniranje direktno u `BusinessModeView`.
   - Montirati stabilne `AddExpenseDialog` instance u `BusinessModeView`, isto kao što je napravljeno u zasebnoj `/business` stranici:

```text
BusinessModeView /home
  Transakcije -> Novo      -> otvara AddExpenseDialog
  Transakcije -> Skeniraj  -> otvara AddExpenseDialog autoScan
  Preview -> Prihvati      -> onAddExpense -> useExpenseCRUD -> expenses insert
```

   - Proslijediti `checkDuplicate` u te dialoge kako ponašanje ostane konzistentno.

3. Učiniti prihvat skena dokazivim i robusnim
   - U `acceptScannedData` zadržati logove za `receipt_scan_accept_attempt`, ali bez PDV-a.
   - Dodati log `receipt_scan_accept_success` nakon uspješnog `executeAdd`.
   - Dodati log `receipt_scan_accept_error` ako save padne, s porukom greške.
   - Ako poslovni mod blokira spremanje zbog obaveznih polja, poruka ostaje jasna: fali trgovac/partner ili datum.

4. Ukloniti krive hardkodirane tekstove u dirnutim dijelovima
   - U dijelovima koje mijenjam koristiti postojeći `t()` pristup ili dodati ključeve za HR/EN/DE gdje ih nema.
   - Posebno u `ScannedDataPreview.tsx` ne dodavati nove hardkodirane UI tekstove.

5. Popraviti Pulse/dijagnostiku da ne izgleda katastrofično zbog warninga
   - Trenutno u zadnja 4 sata postoji samo jedan `performance_metric` warning, nema critical/error zapisa za scanner.
   - Pulse status treba ostati "OK" kad postoje samo performance warningi, a ne prikazivati katastrofu.
   - U `PulseStatusBar` i/ili `usePulseMetrics` odvojiti "kritično/greške" od "upozorenja" jasnije, tako da spor page load ne izgleda kao crash.

6. Popraviti trenutni console warning koji nije scanner, ali zagađuje dijagnostiku
   - Console pokazuje: `Function components cannot be given refs` u `BusinessModuleSettings` na `Badge`.
   - Uzrok je korištenje `Badge` unutar `Switch`/Radix ref okruženja bez `forwardRef` kompatibilnosti.
   - Popraviti tako da se u tom mjestu ne koristi `Badge` komponenta koja dobiva ref, nego običan `span` stiliziran badge-om ili forwardRef kompatibilan wrapper.

7. Validacija nakon izmjena
   - Pokrenuti TypeScript provjeru.
   - Provjeriti kroz logički tok da na `/home` poslovni tab "Transakcije" ima stvarno povezane gumbe "Novo" i "Skeniraj".
   - Očekivani dijagnostički trag nakon sljedećeg skena:

```text
receipt_scan_start
receipt_scan_success
receipt_scan_preview_shown
receipt_scan_accept_attempt
expense_insert_attempt
receipt_scan_accept_success
```

   - Očekivano u bazi: novi red u `expenses` s `business_profile_id`, `amount`, `merchant_name`, `description`, `ai_extracted=true`, bez PDV polja iz aplikacijskog toka.

Neću više tvrditi da je riješeno samo zato što TypeScript prolazi. Ovdje je konkretan dokaz gdje staje i popravak ide baš na taj prekid.