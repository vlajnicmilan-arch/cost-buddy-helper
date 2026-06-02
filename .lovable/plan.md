Plan:

1. Popraviti backend RPC `upsert_active_issue`
   - Trenutni kod već pokušava potisnuti obrisanu/dismissed obavijest 7 dana.
   - Problem je vrlo vjerojatno u tome što funkcija vraća `NULL`, a deklarirana je da vraća `uuid`; to može uzrokovati grešku u reconcileru i ostaviti stanje nedosljednim.
   - Promijeniti funkciju tako da sigurno vraća `uuid` ili `NULL::uuid`, bez rušenja procesa.

2. Popraviti `useIssueReconciler`
   - Kad RPC vrati `null`, tretirati to kao “korisnik je obavijest obrisao, ne prikazuj je ponovno”.
   - Ne dopustiti da jedan suppressed/dismissed budget issue prekine ostatak usklađivanja.
   - Zadržati postojeću logiku: budžetski problem se opet smije pojaviti tek nakon isteka suppression perioda ili nakon stvarne promjene stanja.

3. Uskladiti obavijesti i “Za pažnju”
   - Nakon dismiss/delete akcije refetchati aktivne issue-e kroz postojeći `active-issues-changed` event.
   - Time se sprječava da zvono i sekcija “Za pažnju” kratko žive u različitim stanjima.

4. Provjera
   - Provjeriti da se `budget_burn` obavijest nakon brisanja više ne vraća odmah.
   - Provjeriti da obične obavijesti i dalje koriste stvarno brisanje, a issue obavijesti koriste dismiss.
   - Ne dirati vizualni dizajn ni postojeće rute.