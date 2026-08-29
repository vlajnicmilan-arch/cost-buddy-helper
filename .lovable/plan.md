# Zvjezdica u brief_gate_snapshot_v2

## Opseg
- Napraviti novu migraciju iz trenutačne žive definicije `public.brief_gate_snapshot_v2()`.
- Promijeniti isključivo redak dopuštenja u `v_enabled := (allow ? '*') OR (allow ? uid::text);` uz traženi komentar.
- Ne dirati v1, `app_settings`, ponašanje vrata, rok, učestalost, prekidač ni druge dijelove aplikacije.

## Testovi i sigurnost
- Prebaciti postojeći SQL scenarij vrata na v2 te provjeriti: `[*]`, pojedinačni ID, drugi korisnik, prazan popis, nepostojeća postavka i neprijavljeni poziv.
- Provjeriti da `anon` i `PUBLIC` nemaju `EXECUTE`, a postojeća prava ostaju nepromijenjena.
- Migraciju ne dodavati u `BALANCE_MIGRATIONS.txt`.

## Primjena i provjera
- Primijeniti migraciju kroz backend migracijski alat.
- Ponovno očitati živu definiciju i strojno potvrditi da se u tijelu funkcije razlikuje samo traženi redak dopuštenja (uz dodani komentar).
- Pokrenuti SQL scenarije i relevantne testove te potvrditi da je `brief_gate_user_ids` i dalje `["*"]`.
- Provjeriti repozitorij i bazne funkcije za pozive v1 te izvijestiti je li dokazano mrtva, bez brisanja.
- Objaviti klijent radi traženog živog `build-sha`, zatim očitati točan hash iz objavljene aplikacije. Ako postoji novi zapis nakon otvaranja aplikacije, očitati prvi `brief_gate_exit` i njegov `reason`; inače jasno navesti da zapis još ne postoji.