# Isplate radnika: jedan ekran po osobi (samo plan)

## 1. Funkcije ekrana (1) i ekvivalent u (2)

| Funkcija u `WorkerPayoutsDialog` (1) | Ekvivalent u `PersonPayoutDialog` / `PersonDetailDialog` (2) |
|---|---|
| Razdoblje Od–Do | Kalendar „Razdoblje" (od 13.9.) |
| Izračun iz sati + „Primijeni izračun" | „Izračunaj iz sati" |
| Raščlamba po satnici (sati × satnica, bruto) | Djelomično: prikaz po angažmanu, bez raščlambe po satnici |
| Iznos, novčanik, bilješka | Ima |
| Zbirna isplata kroz više projekata (odabir redaka) | Ima, kroz FIFO raspodjelu (`create_person_payout`, zajednički batch_id) |
| „Zaključaj radne unose" (prekidač, zadano uključen) | Zaključava uvijek (RPC zadano `p_lock_entries = true`), bez prekidača |
| Povijest isplata (po radniku, jedan projekt) | Ima u `PersonDetailDialog`, po osobi kroz sve projekte, grupirano po mjesecu, stornirane skrivene |
| Storno pojedinačne i cijele zbirne isplate | Ima (`usePersonPayoutVoid`) |
| CSV izvoz povijesti | Nema |
| Ulaz: gumb na radniku u tabu Tim projekta | Ulaz: Ljudi → osoba |

## 2. Stvarna upotreba — vlasnik d4d31ee6 (upit na bazi, 25.9.2026)

- Isplate ukupno: 8 (sve za istog radnika). Pojedinačne 6, zbirne 2 retka (jedna zbirna isplata 7.7., dva projekta).
- Stornirane: 4 (tri „Test" 7.–9.7., jedna 25.8.).
- Zapisi zaključavanja (`project_work_entry_locks`) na njegovim projektima: 135 (zaključavanja i otključavanja zajedno; u cijeloj bazi 102 `locked`, 34 `unlocked`). Zaključavanje se, dakle, stvarno koristi.
- Zadnjih 60 dana: 3 isplate (19.8. djelomična, 25.8. stornirana, 13.9. djelomična), sve pojedinačne.
- Kojim ekranom je koja isplata nastala: **ne znam**. Oba puta upisuju isti opis („Isplata: <ime>"), isti batch_id NULL za jednu stavku, a u bazi nema oznake ekrana ni statistike poziva RPC-a. Pouzdano se može reći samo da zbirna isplata 7.7. dolazi iz batch puta.
- CSV: nema traga u bazi (izvoz je lokalna datoteka) — upotreba nepoznata.

Zaključak: zaključavanje, povijest i storno se koriste; CSV i raščlamba po satnici — nepoznato, prenose se da ništa ne nestane.

## 3. Što dodati u (2) (FIFO i iznosi se ne mijenjaju)

- **Zaključavanje:** prekidač „Zaključaj radne unose u razdoblju" uz kalendar, zadano uključen (isto ponašanje kao danas); prosljeđuje `lockEntries` koji `usePersonPayout` već prima.
- **Raščlamba po satnici:** ispod „Izračunaj iz sati" sklopivi prikaz sati × satnica po angažmanu, iz postojećeg preview-a (isti izračun, samo prikaz).
- **CSV:** gumb u povijesti osobe u `PersonDetailDialog`, isti stupci kao danas + stupac projekt; ide kroz `exportTextFile`.
- **Povijest i storno:** već po osobi kroz sve projekte — dodaje se samo filter „projekt" kad se dođe iz projekta.

## 4. Povlačenje (1) bez gubitka

1. Gumb isplate u tabu Tim više ne otvara (1), nego Ljudi → osoba s već odabranim projektom (filter povijesti + kalendar usmjeren na taj angažman). Nepovezan radnik bez osobe: ostaje stari ekran dok se ne utvrdi da takvih nema (provjera upitom prije koraka).
2. `WorkerPayoutsDialog` ostaje u kodu, bez ulaza, jedno razdoblje (npr. 30 dana) bez korištenja; prati se kroz postojeću dijagnostiku.
3. Tek onda brisanje komponente, njenih testova i neiskorištenih prijevoda — zaseban nalog.
4. Baza se ne mijenja ni u jednom koraku.

## 5. Sigurnosni rez u spojenom ekranu

- Otvaranje iz projekta: predloženi iznos i raspodjela samo za taj projekt; ostali angažmani vidljivi, ali s 0 i neoznačeni — uključuju se samo ručno.
- FIFO prijedlog kroz sve projekte samo kad se ekran otvori iz Ljudi bez odabranog projekta, ili nakon izričite radnje „Raspodijeli na sve".
- Stalno vidljiv sažetak iznad gumba: „Isplaćuješ X · Zarađeno Y · Ostaje Z" (za odabrane angažmane).
- Pravilo FIFO i provjera `payout_exceeds_remaining` na serveru ostaju iste.

## 6. Procjena

- **Nalozi:** 3.
  1. Prekidač zaključavanja, raščlamba, sažetak i sigurnosni rez u (2).
  2. CSV + filter projekta u povijesti; ulaz iz projekta preusmjeren na osobu.
  3. Nakon razdoblja bez korištenja: brisanje (1).
- **Migracije:** nijedna.
- **Testovi (vitest):** prekidač šalje `lockEntries`; otvaranje iz projekta ne puni druge projekte; sažetak X/Y/Z; CSV stupci; gumb u tabu Tim otvara osobu s projektom. SQL paketi (balance, worker_payout_*, krug_*) pokreću se kao regresija, ne mijenjaju se.
- **Rizik za saldo:** nizak — isti RPC (`create_person_payout` → `create_worker_payout`), isti trošak i storno. Glavni rizik je UX: slučajna isplata na drugi projekt — pokriva ga točka 5. Drugi rizik: radnik bez povezane osobe gubi ulaz — pokriva korak 4.1.

## Otvoreno pitanje za vlasnika

- Treba li prekidač zaključavanja uopće (danas oba puta zaključavaju zadano), ili je dovoljno uvijek zaključavati kao sada u (2)?
