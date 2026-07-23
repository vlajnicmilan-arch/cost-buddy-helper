Odgovor na tri postavljena pitanja, bez implementacije.

## 1. Rupa u dismissed/reopen logici
Postoji jedna manja rupa: `upsert_active_issue` trenutno traži postojeći issue samo u statusima `active` ili `snoozed`. Ako je issue prethodno `resolved`, sljedeći `upsert` ga NEĆE pronaći i kreirati će potpuno novi zapis — dakle novi UUID, novi `recurrence_count = 1`, bez veze s prethodnim ciklusom.

To znači da "reopen" nakon `resolved` nije zapravo reopen nego novi issue. Ako želite da `recurrence_count` broji koliko se isti problem ponovio kroz vrijeme, trebalo bi proširiti pretragu i na `resolved` unutar određenog vremenskog prozora (npr. 30 dana), pa tada umetnuti novi redak s `recurrence_count = prethodni.count + 1` i istim `dedup_key`. Inače gubite kontinuitet.

Druga stvar: `resolve_stale_issues` postavlja `resolved_at = now()`. Ako se problem vrati sekundu kasnije, to se tretira kao novi događaj. To je OK ako želite čist ciklus, ali vrijedi imati na umu.

## 2. Je li `recurrence_count` korisna informacija ili šum?
Korisna je, ali samo za određene severityje i tipove:
- **Korisno:** `warning`/`critical` gdje uzastopno ponavljanje signalizira sistemski problem — prekoračen budžet, projekt u gubitku, kasne uplate.
- **Šum:** `info` notifikacije (npr. "uspješno sinkronizirano", "dobrodošli") — tamo badge samo zbunjuje.

Preporuka: prikazivati badge samo za `warning`/`critical`. Također, razmislite o razlici između:
- `recurrence_count` = koliko puta se isti aktivni issue ponovio dok nije riješen,
- `total_occurrences` = ukupno u povijesti (druga metrika, analytics).

Ako pokažete samo `recurrence_count`, korisnik dobiva jasan signal: "ovaj problem se ne rješava".

## 3. Reset ili akumulacija?
**Preporuka: resetirati na 0 pri `resolved`.**

Razlog: `recurrence_count` treba opisivati **trenutni aktivni ciklus** problema. Kad issue postane `resolved`, korisnik ga smatra riješenim. Sljedeće ponavljanje je novi ciklus i novi mentalni račun: "opet se događa".

Akumulacija kroz cijelu povijest može brzo postati nečitljiva (npr. "prekoračeno 47×") i gubi kontekst. Ako želite ukupnu povijest, to je bolje drži u zasebnoj analytics koloni (`lifetime_count`), a ne u aktivnom issue badgeu.

## Dodatna razmatranja
- Razmislite o `first_seen_at` / `last_seen_at` uz count — korisniku je korisnije vidjeti "prvi put 3.7., ponovljeno 4×" nego samo broj.
- Ako dodajete `recurrence_count`, razmislite o točnom trenutku incrementa: samo u `UPDATE` grani `upsert_active_issue` (kad se issue ponovno pojavi), a NE u `INSERT` grani. Inače će svaki novi issue imati count = 1, što je redundantno.
- Razmislite o gornjem limitu prikaza (npr. "9+" umjesto 47) da ne razbijate UI.

## Zaključak
Dodavanje `recurrence_count` ima smisla, ali:
1. treba popraviti pretragu da uključuje nedavno `resolved` issue ako želite kontinuitet,
2. prikazivati ga samo za `warning`/`critical`,
3. resetirati ga na 0 pri `resolved` — akumulaciju držati zasebno ako je ikad potrebna.