Ne, ovo više ne smije ići po nagađanju. Trenutno smijem tvrditi samo ovo:

## Potvrđeno

- Artikli nisu nestali svi: u bazi postoji 981 zapis u `receipt_items`, za 323 transakcije.
- Najnoviji artikl u bazi je zapisan 20.03.2026.
- Novije skenirane transakcije postoje, ali nemaju redove u `receipt_items`.
- Logovi skenera nakon 22.05. potvrđuju da je OCR prepoznavao artikle (`item_count`), ali ti logovi ne sadrže nazive artikala.
- Postoji kodna greška u putanji spremanja: wrapper koji se koristi na dashboardu ne prosljeđuje `items` dalje u stvarni `addExpense` poziv.
- Postoje i hard-delete putanje nad `expenses`; zbog `ON DELETE CASCADE` one mogu obrisati povezane artikle ako je obrisana roditeljska transakcija.

## Nije potvrđeno

- Ne mogu 100% tvrditi da je samo wrapper greška uzrok svih nestalih artikala.
- Ne mogu tvrditi da su nazivi novijih artikala izgubljeni dok ne provjerimo lokalni cache na uređaju na kojem su računi skenirani/pregledavani.
- Ne mogu iz cloud logova rekonstruirati nazive artikala, jer se tamo logirao broj artikala, ne sadržaj.

## Pravilo od sada

Bez ikakvih daljnjih izmjena poslovne logike dok se ne napravi forenzička provjera. Svaki sljedeći korak mora imati:

1. dokaz prije promjene,
2. minimalnu promjenu,
3. provjeru nakon promjene,
4. bez bulk update/delete operacija.

## Plan oporavka

### 1. Freeze i sigurnosna provjera

- Ne dirati postojeće transakcije.
- Ne pokretati migracije koje brišu ili prepisuju podatke.
- Napraviti samo read-only inventuru:
  - transakcije s `ai_extracted=true`,
  - broj artikala po transakciji,
  - transakcije bez artikala nakon 20.03.,
  - sve hard-delete migracije i RPC funkcije koje mogu kaskadno obrisati artikle.

### 2. Dokazati write-path kvar na kontroliranom primjeru

- Pratiti jednu novu test transakciju od skena do baze:
  - koliko artikala izlazi iz OCR-a,
  - koliko artikala ulazi u `onAdd`,
  - koliko artikala ulazi u `addExpense`,
  - koliko ih stvarno završi u `receipt_items`.
- Tek ako se potvrdi točna točka prekida, popraviti samo tu točku.

### 3. Zaustaviti daljnji gubitak novih artikala

- Popraviti prosljeđivanje `items` kroz postojeći shared flow.
- Dodati error handling za insert u `receipt_items`, tako da aplikacija više ne smije prikazati uspjeh ako artikli nisu spremljeni.
- Dodati dijagnostiku: `items_received`, `items_inserted`, `expense_id`.

### 4. Pronaći postojeće artikle iz lokalnog uređaja

- Dodati privremeni recovery ekran/alat koji samo čita lokalne zapise:
  - `receipt_cache_*` iz web/local storage sloja,
  - IndexedDB `receipt_items`,
  - auto-backup ako postoji.
- Prikazati broj pronađenih cache zapisa i artikala.
- Ništa ne upisivati automatski.

### 5. Siguran restore samo uz potvrdu

- Matchati lokalni cache prema postojećim transakcijama po datumu, iznosu, merchant/opisu i vremenu spremanja.
- Restore dopustiti samo za transakcije koje trenutno nemaju artikle.
- Sigurne parove prikazati za potvrdu.
- Nesigurne parove ostaviti za ručni pregled.

### 6. Spriječiti ponavljanje

- Dodati regresijski test za spremanje artikala iz skeniranog računa.
- Dodati zaštitu da budući refactor ne može pozvati `addExpense` bez artikala ako su oni već prepoznati.
- Dodati alarm/log kad `ai_extracted=true`, a `receipt_items` insert završi s 0 redova.

## Što neću raditi

- Neću nagađati uzrok kao činjenicu.
- Neću raditi bulk restore bez pregleda.
- Neću mijenjati saldo, projekte, budžete, bank match ili stare transakcije.
- Neću brisati ništa.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>