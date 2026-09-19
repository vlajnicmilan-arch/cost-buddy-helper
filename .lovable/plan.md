# Bankovna sinkronizacija (Enable Banking) — popravak incidenta 17.–18.9.2026

Cilj: sinkronizacija smije upisati samo ono što je banka stvarno proknjižila, mora znati koja je kartica platila, prijenos između korisnikovih novčanika upisati kao prijenos, i sačuvati cijeli izvorni zapis banke kao dokaz.

Enable Banking ostaje isključen korisnicima dok točke 1–4 nisu gotove i testirane.

## Što je danas provjereno u kodu i bazi

- `bank-sync-transactions` čita samo 8 EB polja (`entry_reference`, `transaction_id`, `booking_date`, `value_date`, `transaction_amount`, `credit_debit_indicator`, `remittance_information`, `creditor`/`debtor`, `status`) i sve ostalo baca.
- `status` se čita u tip, ali se **nigdje ne koristi** — rezervacija se upisuje jednako kao proknjižena stavka. To je izravan uzrok dva retka od 300 €.
- Jedinstveni indeks je `(user_id, bank_transaction_id)`. Rezervacija i proknjižena stavka imaju **različit** ID, pa indeks ne sprječava dvostruki upis.
- Smjer ide kroz zajednički `resolveBankTxDirection`, ali se `reason`/`confidence` samo ispisuju u log i nestaju.
- `bank_raw_line` i `bank_raw_line_source` postoje (tekst), ali sync ih ne puni. **Pažnja:** postojeći CHECK dopušta samo `text|html|ai` — vrijednost `enable_banking` traži additivnu izmjenu tog ograničenja.
- Izračun salda (`_expenses_recompute_source_balance`) uopće ne gleda `bank_match_status` — dakle „upiši rezervaciju kao `pending_bank`" **bi svejedno pomaknulo saldo**. Zato je sigurna opcija preskakanje.
- Kartice postoje: `payment_source_cards(last_four_digits, payment_source_id, user_id)`, a `expenses.payment_source_card_id` se već koristi. Postoji `extractCardInfo` u `src/lib/csvParsers.ts` (samo zadnje 4 znamenke, bez maski tipa `462765XXXXXX2081`).

## Točka 0 — broj kartice kao primarni signal

Novi čisti modul `src/lib/cardMatch.ts` + zrcalo `supabase/functions/_shared/cardMatch.ts` (isti obrazac i isti mirror-test kao `moneyDirection`):

- `extractCardMasks(text)` — vraća sve maske iz teksta: `462765XXXXXX2081`, `416598******1542`, `**5385*`, `Kartica: …1542`, `Visa *1234`. Normalizira na zadnje 4 znamenke (+ BIN kad postoji).
- `matchUserCard(masks, cards)` — determinističko uparivanje sa `payment_source_cards.last_four_digits`; više pogodaka ili nijedan → `null`, bez pogađanja.
- Rezultat: `payment_source_card_id` + novčanik te kartice = platilac.
- Ako tekst nosi broj **druge** korisnikove kartice → redak je prijenos između vlastitih novčanika, odredište = novčanik te kartice. Bez ključnih riječi.
- Ako broj kartice ne odgovara novčaniku na koji sync piše → redak se ne upisuje tiho: označava se za potvrdu (točka 3) i razlog ide u sirovi zapis.
- Naziv („Revolut", „Aircash") ostaje samo rezerva kad broja nema.

Isti modul kasnije koristi i uvoz izvoda — u ovom koraku ga samo pozivamo iz syncа, ImportReview se ne dira.

Posao: ~pola dana (modul + testovi + zrcalo).

## Točka 1 — sirovi zapis svakog retka

- U `bank_raw_line` upisati **cijeli EB objekt transakcije** kao JSON string (ne samo 8 polja koja danas čitamo), `bank_raw_line_source = 'enable_banking'`.
- Uz to u isti JSON dodati odluku aplikacije: `direction`, `confidence`, `reason`, rezultat uparivanja kartice, i je li redak bio rezervacija.
- **Traži jednu additivnu migraciju:** proširiti CHECK na `bank_raw_line_source` vrijednošću `'enable_banking'`. Nema novih stupaca, nema brisanja.
- Koja polja EB stvarno vraća i postoji li zasebno polje za broj kartice (u ISO 20022 shemi to bi bio `card_transaction`/`masked_pan`) — **ne mogu potvrditi iz koda**, jer trenutna funkcija ostatak odgovora baca. Zato ovaj korak ide prvi: nakon prvog sync-a s punim zapisom vidimo stvarnu shemu banke i tek onda fiksiramo pravila.

Posao: ~2 sata.

## Točka 2 — rezervacije vs proknjiženo

- Primarni kriterij: EB `status` (`PDNG`/`BOOK`). Sekundarni: prazan `booking_date`. Format ID-a (`G…R…D` bez dugog prefiksa) koristimo samo kao dodatni signal u logu, ne kao pravilo — to je zapažanje iz jedne banke, ne iz sheme.
- Rezervacija se **ne upisuje** (skipped + zabilježena u dijagnostiku). Razlog za ovu opciju umjesto `pending_bank`: motor salda ne gleda `bank_match_status`, pa bi i „pending" redak pomaknuo saldo.
- Njezinom `credit_debit_indicator`-u se ne vjeruje ni za što.
- Kad stigne proknjižena verzija, ona se normalno obrađuje. Dodatno se prije upisa traži već upisani redak istog iznosa (±0,00), datuma ±3 dana i iste kartice/protustrane te se **ažurira**, umjesto da se doda novi.
- Rezervacije koje nikad ne postanu proknjižene jednostavno nestanu — jer ih nikad nismo ni upisali. Nema čišćenja.

Posao: ~pola dana.

## Točka 3 — prijenosi kroz zajednički put

Redak prepoznat kao prijenos (po točki 0 ili `TRANSFER_KEYWORDS`) ne smije se upisati kao rashod/priljev, nego kroz `buildTransferPair` — jedan redak `type='transfer'`, `payment_source` = platilac, `income_source_id` = primatelj.

Dvije opcije:

- **A — sve kroz ImportReview** (pravi popravak kvara #4): sync ne piše ništa izravno, nego puni pregled koji korisnik potvrdi. Prednost: jedan put za sve vanjske podatke, ništa se ne upiše bez pogleda. Rizik: veći zahvat (sync danas piše iz edge funkcije servisnim ključem, ImportReview radi u pregledniku) — ovo je poseban, veći projekt.
- **B — automatski upis prijenosa samo kad je siguran, ostalo na potvrdu**: prijenos se upisuje automatski **samo** kad su obje strane određene brojem kartice; sve ostalo ide kao redak koji čeka potvrdu. Manji zahvat, zatvara ovaj incident.

Preporuka: **B sada, A kao zaseban projekt.**

Posao (B): ~dan.

## Točka 4 — regresijski testovi

- Dvije rezervacije 300 € „Revolut**5385* Dublin" s CRDT i kratkim ID-om → 0 upisa, 0 duplikata.
- Nakon proknjižene verzije istog iznosa → točno **1** prijenos Tekući zaštićeni → Revolut, bez priljeva.
- Maska `…2081` → kartica TZ Fizička; `Kartica: …1542` → Revolut kartica; nepoznat broj → bez uparivanja.
- Mirror-test za `cardMatch` zrcalo, po uzoru na postojeći `moneyDirectionMirror.test.ts`.

Posao: ~pola dana.

## Najmanji korak koji zatvara sva tri kvara za ovaj slučaj

Točke **1 + 2 + 0(minimalno)**: puni sirovi zapis, preskakanje rezervacija, i uparivanje kartice koje prijenos prepoznaje. Time nestaju oba lažna priljeva i duplikat. Točka 3-B je sljedeći korak da prijenos dobije i drugu stranu.

## Migracije

Očekivano: **jedna additivna** — proširenje CHECK-a na `bank_raw_line_source` za `'enable_banking'`. Bez novih stupaca, bez promjene postojećih podataka.

## Što ostaje otvoreno dok ne vidimo sirovi EB odgovor

- Točne vrijednosti `status` koje ta banka šalje i šalje li uopće zasebno polje s maskom kartice.
- Nosi li proknjižena verzija ikakvu poveznicu na svoju rezervaciju (ako da, uparivanje po iznosu/datumu postaje rezerva, ne glavno pravilo).
- Kako banka označava protustranu kod prijenosa na Revolut.

## Postojeći krivi retci

Dva retka od 300 € (`G1204340R918423D`, `G201R005360616D`) ostaju u bazi dok ne kažeš da ih uklonimo — to je promjena podataka, ne dio ovog popravka.

Ne diramo: motor salda i sidara, uvoz izvoda i ImportReview logiku, RLS, ručni unos, notifikacije. Bez objave.
