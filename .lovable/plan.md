Provjerio sam stvarno stanje:

- Backend je zdrav.
- `receipt_items` nije prazan: postoji 981 artikl na 323 transakcije.
- Problem je potvrđen: tablica `receipt_items` i dalje nema Data API dozvole za `authenticated` ni `service_role`, pa aplikacija ne može dohvatiti artikle.

Plan popravka:

1. Ponovno primijeniti backend migraciju koja dodaje dozvole samo za `receipt_items`:
   - prijavljeni korisnici mogu čitati/dodavati/uređivati/brisati artikle koje im RLS dopušta
   - servisni backend ima puni pristup za interne procese
   - bez anonimnog pristupa
2. Nakon migracije provjeriti:
   - da dozvole stvarno postoje u bazi
   - da broj artikala ostaje isti, bez brisanja ili mijenjanja podataka
3. Ako artikli i dalje ne budu vidljivi u UI-u, tek tada provjeriti frontend upit i RLS policy za konkretan otvoreni račun.

Ovo nije migracija podataka i ne dira postojeće artikle — samo vraća pristup aplikaciji.