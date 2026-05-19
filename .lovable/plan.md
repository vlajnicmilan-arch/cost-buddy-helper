## Što je stvarno viđeno
- Backend parser je za isti Aircash izvod vratio različite brojeve redaka: 57, 48 i 49 transakcija.
- Baza je nakon importova dobila različite batch-eve: 31, 13 i 8 novih redaka u zadnja tri pokušaja.
- Postoji DB unique zaštita samo za `bank_transaction_id`, ali PDF/HTML import ga uopće ne puni, pa zaštita ne radi.
- Trenutni duplicate check je samo aplikacijski i namjerno preblag za bulk import; zato isti izvod može više puta dodavati redove.

## Plan popravka

### 1. Deterministički identitet transakcije
- Dodati centralni helper za import fingerprint transakcije.
- Fingerprint će se računati iz stabilnih polja: korisnik + payment source + datum + tip + iznos + normalizirani opis/merchant.
- PDF/HTML import će svakoj transakciji dodijeliti `bank_transaction_id` iz tog fingerprinta.
- Time postojeći DB unique index `user_id + bank_transaction_id` konačno postaje aktivan za PDF/HTML import.

### 2. Import bez dvostrukog upisa
- Promijeniti `importFromCSV` da za transakcije s `bank_transaction_id` koristi upsert/ignore duplicates umjesto slijepog insert-a.
- Balans ažurirati samo za stvarno umetnute redove, ne za preskočene duplikate.
- UI poruka treba prikazati stvarno uvezen broj, ne broj pokušanih redaka.

### 3. Ujednačiti lokalni i globalni PDF tok
- Ukloniti zastarjeli lokalni PDF import tok iz `PaymentSourceTransactionsDialog` koji je ostao paralelno uz globalni host.
- Jedan izvor istine ostaje `GlobalPDFImportHost` + `PdfImportContext`.
- Time smanjujemo rizik da se isti posao obradi dva puta ili da se recovery veže na krivi tok.

### 4. Pojačati duplicate detekciju za uvoz izvoda
- Za PDF/HTML/CSV bulk import promijeniti pravilo: isti datum + isti iznos + isti izvor + vrlo sličan opis/merchant mora biti hard duplicate, ne “suspicious”.
- Zadržati postojeću zaštitu da dvije realne iste kupnje istog dana ne budu automatski blokirane samo po iznosu bez opisa/merchant matcha.

### 5. Parser: zaustaviti “različit broj svaki put” koliko je moguće
- Za HTML izvode: koristiti postojeći deterministički table pre-parser kao primarni izvor kad su redovi jasno izvučeni, a AI samo za klasifikaciju/opis ako treba.
- Za PDF gdje ovisimo o AI-u: dodati strožu validaciju rezultata i upozorenje/prekid kad broj redaka očito varira ili je sumnjivo nizak, umjesto da se polovičan rezultat odmah može uvesti.

### 6. Testovi
- Dodati regresijske testove za fingerprint i duplicate scoring.
- Testirati da ponovni import istog skupa vraća 0 novih redaka na logičkoj razini.

## Tehnički detalji
- Ne dirati `src/integrations/supabase/client.ts` ni `types.ts`.
- Ako `ParsedTransaction` dobije `bank_transaction_id`, tip proširiti u aplikacijskom kodu, a ne ručno u generated backend typovima.
- Ako bude potrebna nova DB kolona za dodatni fingerprint, ide isključivo migracijom; trenutno izgleda da postojeći `bank_transaction_id` može poslužiti.