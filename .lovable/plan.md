# Plan: Ljudi — novčani ostatak, namirenje duga i sažeta povijest

## Potvrđeno početno stanje

- Kartica osobe danas računa `ostaje` iz radnih unosa kojima je `payout_id IS NULL`; zato potpuno zaključana djelomična isplata skriva novčani dug.
- Živi redak angažmana „Duje i Dunja” ima `gross_amount = 574,00`, `paid_amount = 500,00`, `status = partial`, dok je svih 82 sata zaključano. Stvarni ostatak tog retka je 74,00 €.
- Postojeći `create_person_payout` također provjerava samo vrijednost slobodnih sati, a `create_worker_payout` bi isplatu bez slobodnih sati označio kao `advance`. To nije prihvatljivo za namirenje starog duga.
- Povijest na kartici osobe trenutačno prikazuje sve isplate u jednom ravnom popisu; postojeći zapamćeni obrazac „Prikaži sve” nalazi se u Novčaniku.

## Što će se izgraditi

### 1. Jedinstvena novčana mjera ostatka

- Za svaki angažman izračun će biti: `zarađeno iz svih sati − stvarno isplaćeno iz živih isplata`, zaokruženo na cent.
- Stornirane i obrisane isplate neće ulaziti u `isplaćeno`; aktivni `paid`, `partial` i postojeći `advance` retci ostaju stvarno isplaćen novac.
- Ukupni ostatak osobe bit će zbroj ostataka angažmana i istodobno jednak `ukupno zarađeno − ukupno isplaćeno`.
- Podatak o slobodnim satima ostat će samo za određivanje redovnog perioda i zaključavanje, nikad više kao mjera novčanog duga.

### 2. Serverski čuvano namirenje starog duga

- `create_person_payout` će za svaki angažman pod zaključavanjem retka serverski izračunati ukupno zarađeno po povijesti satnice i oduzeti sve žive isplate.
- Svaki traženi iznos iznad tog stvarnog duga bit će odbijen s jasnim kodom/porukom `payout_exceeds_remaining`; 75,00 € uz dug 74,00 € mora pasti prije bilo kojeg upisa.
- Ako stavka ima dovoljno slobodnih sati, poziva se postojeći put `create_worker_payout` bez promjene njegova ponašanja.
- Ako dio ili cijeli iznos nema pokriće u slobodnim satima, ali ima pokriće u stvarnom dugu, `create_person_payout` stvara novi redak namirenja:
  - `hours_covered = 0`
  - `gross_amount = paid_amount = iznos namirenja`
  - `status = paid`
  - isti angažman i period izvornog aktivnog `partial` retka koji nosi nepodmireni dio
  - vlastiti `expense_id` za pojedinačnu isplatu; kod postojeće zbirne isplate ostaje jedan zajednički trošak i zajednički `batch_id`.
- Stari `partial` redak ostaje potpuno nepromijenjen. Novi redak čuva istinu da je doplata stvarno izvršena kasnije.
- Za miješanu raspodjelu (slobodni sati + stari dug) redovni dio zadržava postojeći obračun i zaključavanje, a samo nepokriveni novčani dio postaje redak namirenja. Ukupan trošak i dalje odgovara stvarno isplaćenom iznosu bez dupliranja.

### 3. Dijalog isplate

- Obveze će se graditi iz iste novčane mjere kao kartica, pa će FIFO prijedlog uključiti i zaključani nepodmireni dio.
- Nepodmireni dio postojećeg `partial` retka bit će jasno imenovan po mjesecu, npr. „Nedoplaćeno iz srpnja: 74,00 €”.
- Promjenjiva raspodjela i zabrana predujma ostaju; klijentska validacija koristi novčani ostatak, a baza ostaje konačna brana.
- Nakon isplate/refetcha kartica, projektni redak i ukupni iznos odmah koriste isti izračun.

### 4. Povijest isplata

- Zadano se prikazuje zadnjih 5 živih isplata.
- „Prikaži sve (N)” koristi isti zapamćeni `localStorage` obrazac kao popis računa u Novčaniku; stanje je zajedničko za kartice osoba i može se vratiti na „Prikaži manje”.
- U razvijenom prikazu žive isplate grupiraju se po lokaliziranom mjesecu i godini. Zaglavlje prikazuje mjesec, broj isplata i zbroj stvarno isplaćenog tog mjeseca.
- Stornirane isplate ostaju izvan živih mjesečnih zbrojeva i skrivene su po zadanom iza zasebnog tihog retka „+ N storniranih”. Njihovo otvaranje je zasebno od „Prikaži sve”, a prikaz ostaje precrtan s razlogom i postojećom radnjom/oznakama.
- Sve nove oznake i množine bit će dodane u HR/EN/DE kataloge; format mjeseca prati aktivni jezik.

## Baza i tehnički zahvati

- Nova migracija mijenja samo živu definiciju `public.create_person_payout`, preuzetu putem `pg_get_functiondef`; ne mijenja tablice ni postojeće podatke.
- `void_worker_payout`, `void_worker_payout_batch` i postojeći `create_worker_payout` ostaju nepromijenjeni.
- Migracija zadržava postojeće `SECURITY DEFINER`, `search_path`, revoke/grant i vlasničke provjere.
- Budući da put upisuje u `expenses`, migracija ulazi u balance SQL gate prema postojećem pravilu projekta.

## Testovi i provjera

- Vitest regresija zaključava invariant po angažmanu i ukupno: `zarađeno − isplaćeno = ostaje` do centa, uključujući zaključani `partial` 574/500, storniranu isplatu i novi redak namirenja 74/74.
- Testovi FIFO/validacije potvrđuju da je 74,00 € ponudivo i da 75,00 € prelazi dug.
- UI testovi/pure helper testovi potvrđuju: početnih 5 živih redaka, zapamćeno širenje, mjesečne grupe i zbrojeve te 4 stornirane skrivene do izričitog otvaranja.
- SQL regresija potvrđuje: 74,00 € stvara novi payout s 0 sati, `gross = paid = 74`, `status = paid` i jedan expense; stari `partial` ostaje nepromijenjen; 75,00 € se odbija bez djelomičnog upisa.
- Postojeći SQL scenariji potvrđuju da redovna projektna isplata, batch isplata, zaključavanje i oba puta storniranja rade nepromijenjeno.
- Pokrenuti ciljane Vitest testove, puni `npm test` i obvezni balance SQL suite; zatim primijeniti migraciju i objaviti klijent.
- Na živim podacima prije isplate provjeriti Petra: projektni ostatak 74,00 € i ukupno 1.789,00 €. Neću izvršiti stvarnu isplatu bez zasebne izričite naredbe jer bi to stvorilo financijski zapis i trošak; funkcionalnost ću dokazati SQL testom i u sučelju.
- Objavu potvrditi novim Vite asset žigom i sadržajem, ne `version.json`.

## Izričito izvan zahvata

- Ne diraju se suradnici (`project_collaborators`), postojeći payout retci, SQL funkcije storniranja, `create_worker_payout`, zaključavanje sati, povijest satnice, obračun po satnici, projektni put isplate/storniranja, executor uvoza, saldo/sidra, Novčanik ni mail lijevak.
- Ne mijenjaju se paketi ni lockfileovi; `bun.lock` ostaje jedini lockfile.
