# Dijagnoza: crven "Manual↔Bank Merge SQL Suite"

## 1. Što test postavlja
Greška `manual_bank_merge.sql:367` je kraj DO bloka sekcije 4 (psql javlja zadnji redak naredbe). Unutar bloka pada slučaj **4.13a**: ručni redak `currency = NULL`, bankovni `'EUR'`, isti vlasnik/novčanik/iznos 21,50, razmak 1 dan. Test poziva `merge_manual_with_bank` izravno (ne kroz `assert_raises`) i očekuje `bank_match_status = 'confirmed'`. 4.13b (NULL+NULL → spaja) i 4.13c (USD+EUR → `different_currency`) su dodani istim commitom.

## 2. Što je promijenjeno
`drizzle/migrations/0013_merge_currency_null_eur.sql`, jedina razlika u funkciji:
- prije (0012 i supabase/migrations/20260824190123): `UPPER(COALESCE(v_manual.currency,'')) IS DISTINCT FROM UPPER(COALESCE(v_bank.currency,''))`
- poslije (0013): `UPPER(COALESCE(v_manual.currency,'EUR')) IS DISTINCT FROM UPPER(COALESCE(v_bank.currency,'EUR'))`

Hash commita (8949f4e) nisam mogao provjeriti lokalno — git povijest ovdje ima samo generičke "Changes" poruke.

## 3. Presuda: ni test zastario ni kvar u funkciji — kvar je u harnessu
Test je nov i ispravan; funkcija 0013 je ispravna. `supabase/tests/merge/run.sh` primjenjuje samo migraciju 20260824190123 i blok iz **0012** (`sed ... 0012_*.sql`), a **0013 nikad ne primjenjuje**. Harness zato testira staru funkciju (`COALESCE(...,'')`): za 4.13a to je `'' ≠ 'EUR'` → `different_currency`. Test ispravno hvata da testirana funkcija nije ona koja je u produkciji.

Run #51 (7d257cf) nije uveo novi kvar; ostaje crven jer naslijeđuje isti harness.

## 4. Živa baza vs repozitorij
`pg_get_functiondef('public.merge_manual_with_bank')` se poklapa s tijelom funkcije u 0013 (redak 42: `COALESCE(...,'EUR')`, uz nasljeđivanje `event_at`/`time_confidence` i `user_edited_event_at=false`). Razlika je samo u REVOKE/GRANT naredbama iza tijela, a njih pg_get_functiondef ionako ne vraća. Supabase migracija 20260824190123 i blok iz 0012 u harnessu su zastarjeli u odnosu na živu bazu.

## 5. Živi podaci, korisnik d4d31ee6 (samo čitanje)
- Nepovezani ručni retci (bez bankovnog id-a): 1.188, **svi imaju `currency = NULL`**.
- Mogući parovi (isti novčanik, vrsta i iznos, bankovni redak od 1 dan prije do 3 dana poslije, ručni `manual`/`pending_bank`, bankovni nespojen): 24.
- Staro pravilo (`''`) odbilo bi **10** od njih kao "različite valute"; novo pravilo (`'EUR'`) odbija **0**.
- Živa funkcija je već na novom pravilu, pa se ti parovi u produkciji danas ne odbijaju krivo. Ne znam koliko ih je odbijeno prije primjene 0013 — iz baze to ne mogu pročitati.

## 6. Prijedlog popravka (opis)
1. `run.sh`: nakon bloka iz 0012 primijeniti i tijelo funkcije iz `0013_merge_currency_null_eur.sql` (cijela datoteka ili samo blok s funkcijom, ako 0013 ima i druge dijelove). Bolje trajno rješenje: harness uzima **zadnju** migraciju koja redefinira `merge_manual_with_bank` (ili izričit popis u `MERGE_MIGRATIONS.txt`), da se ovo ne ponovi uz 0014+.
2. Podići brojčanu branu u `.github/workflows/merge-sql-suite.yml` s 32 na stvaran broj PASS tvrdnji nakon 4.13a/b/c (očekivano 35), da tihi gubitak scenarija ne prođe.
3. Po želji: brana u harnessu koja nakon primjene provjeri da tijelo funkcije sadrži `COALESCE(v_manual.currency,'EUR')`, tj. da je testirana ista funkcija kao živa.

Bez promjene funkcije, podataka i testnih slučajeva.

**Dokaz:** lokalno `bash supabase/tests/merge/run.sh` na postgres:16 — 4.13a i 4.13b PASS, 4.13c PASS (`different_currency`), svi raniji scenariji ostaju PASS, broj PASS ≥ nova brana. Protudokaz: bez koraka 1 4.13a pada točno kao u CI-ju.
