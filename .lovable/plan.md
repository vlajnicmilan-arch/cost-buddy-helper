# Nalaz: bankovna sinkronizacija kvari saldo

Dijagnoza je napravljena čitanjem koda i provjerom stvarnih redaka u bazi. Ništa nije mijenjano.

## 1. Koji kod obavlja sinkronizaciju

- Edge funkcija: `supabase/functions/bank-sync-transactions/index.ts` (457 linija).
- Pozivatelji (klijent): `src/components/OpenBankingPanel.tsx` (gumb po računu) i `src/hooks/useSyncAllBankAccounts.ts` (gumb „Sinkroniziraj sve"). Oba rade izravan `fetch` na funkciju.
- Funkcija koristi **service_role klijent** i piše **izravno u `expenses`** (`admin.from("expenses").insert(row)`), odnosno `update` kad nađe točno jednog kandidata. Nikakav review korak ne postoji — nema UI potvrde, nema staging tablice.

## 2. Ima li provjeru duplikata

Ima, ali slabu, i to na dvije razine:

- **Tvrda razina:** jedinstveni indeks `(user_id, bank_transaction_id)`. Štiti samo od ponovnog uvoza *istog bankovnog identifikatora*. Kod hvata `23505` i broji ga kao `skipped`.
- **Meka razina:** `findCandidates()` — traži postojeći redak uz **sve ove uvjete istovremeno**:
  - isti `payment_source`, isti `type`, iznos ±0,01,
  - `bank_transaction_id IS NULL`, `bank_match_status IN (manual, pending_bank, bank_only)`,
  - datumski prozor: **<10 € isti dan, 10–50 € ±1 dan, >50 € ±3 dana**.

Ono čega **nema**, izričito:
- ne koristi `src/lib/importFingerprint.ts` (SHA-256 otisak),
- ne koristi `src/lib/duplicateDetection.ts` (4-razinsko bodovanje, normalizacija trgovca, geo stop-riječi),
- **ne uspoređuje naziv trgovca uopće** — match je čisti iznos+datum,
- ne gleda `tx.status` (PENDING vs BOOKED) — vidi točku 5.

## 3. Zašto nema `import_batch_id`

Funkcija u `row` objektu jednostavno ne postavlja `import_batch_id`, `bank_row_seq` ni `balance_after`, i ne upisuje redak u `imported_statements`. Potvrđeno na podacima: svih 14 redaka od sinkronizacije 7.8. ima `import_batch_id` prazan, dok redci iz PDF uvoza od 2.8. uredno imaju batch id.

Posljedica: `undo_import_batch` (Poništi uvoz) na te retke **ne radi**, ne postoji reconciliation zapis, ne pokreće se sidrenje/`historyGate`, a `ImportReview` se nikad ne otvori.

Procjena: nije namjerno u smislu odluke „sinkronizacija ne treba batch", nego posljedica toga što je sync pisan prije/paralelno s uvoznim slojem i nikad nije spojen na njega. Ima svoju paralelnu logiku (`bank_match_status`, `possible_duplicate_of`, `BankDuplicateSheet`) koja pokriva samo dio onoga što `ImportReview` radi.

## 4. Odakle obrnut predznak

Smjer se određuje jednom linijom:

```
const isIncome = tx.credit_debit_indicator === "CRDT";
```

Nema provjere predznaka `transaction_amount.amount` (uzima se `Math.abs`), nema unakrsne provjere s `creditor`/`debtor` poljem, nema fallbacka ako indikator nedostaje ili je obrnut. Sve što nije doslovno `"CRDT"` završi kao rashod; sve što jest, kao priljev.

Dokaz u bazi — dva retka sa sinkronizacije 1.8.2026:

| datum | tip | iznos | opis | bank id |
|---|---|---|---|---|
| 31.7. | income | 276,49 | KERA TERM TRGOVINA Split | `G089R005354717D` |
| 31.7. | income | 59,37 | LUKOIL DRACEVAC MRAVINCE | `G087R005351701D` |

Trgovački nazivi, a upisani kao priljev — dakle banka je za te stavke vratila `credit_debit_indicator = "CRDT"`. Format identifikatora (`G0…R…D`) razlikuje se od onoga s uvoza 7.8. (`105G40610R418857D`), što upućuje da su to **rezervacije/pending zapisi**, ne knjiženja. Nije potvrđeno bez sirovog API odgovora — to je hipoteza, ne činjenica.

Dodatni efekt: `findCandidates` filtrira po `type`, pa redak s obrnutim predznakom **ne može** biti prepoznat kao duplikat korisnikovog ručnog rashoda. Poništi ga u saldu i tiho nestane iz vidokruga.

## 5. Odgoda knjiženja kartičnih transakcija

Pravila za to **nema**. Postoji samo fiksni datumski prozor iz točke 2, koji je preuzak upravo za kartice:

- 19,25 € — ručni unos 3.8., bankovni redak 6.8. → razmak 3 dana, prozor za 10–50 € je ±1 dan → **promašaj**, umetnut novi redak.
- 59,37 € — ručni unos 31.7., bankovni redak 5.8. → razmak 5 dana, prozor za >50 € je ±3 dana → **promašaj**.

Uz to, `tx.status` se nigdje ne čita. Ista kartična kupnja stiže dvaput: prvo kao rezervacija (jedan `entry_reference`), pa kao knjiženje (drugi `entry_reference`). Jedinstveni indeks ih vidi kao dvije različite transakcije i obje uđu. To objašnjava par LUKOIL 59,37 (31.7. „income" pending + 5.8. expense booked) — isti novac, dva retka, dva različita smjera.

## Zbirno: četiri kvara

1. Datumski prozor prekratak za kartično knjiženje (dani, ne sati).
2. Match ignorira naziv trgovca — jedini signal je iznos, pa je prozor morao ostati uzak da izbjegne lažne spojeve. Začarani krug.
3. Pending i booked zapisi tretiraju se kao dvije transakcije.
4. Smjer se slijepo preuzima iz `credit_debit_indicator`, bez ijedne kontrole zdravog razuma.

Peti, procesni: sve to zaobilazi `ImportReview`, pa korisnik nikad ne vidi prijedlog spajanja niti može poništiti uvoz.

## Opseg rizika

Za sada je pogođen samo vlasnik računa (jedini s linkanim bankovnim računima — provjereno). Ako se Enable Banking uključi široko, svaki korisnik s karticom dobiva isti obrazac: dvostruko knjižene kupnje i povremeni obrnuti predznak koji tiho poništi rashod.

## Sljedeći korak

Bez izmjena dok se ne odluči opseg. Prijedlog redoslijeda kad se krene:
1. Obrnut predznak (najopasniji — tiho poništava novac).
2. Pending/booked deduplikacija.
3. Prozor + usporedba trgovca (ponovna uporaba `duplicateDetection.ts`).
4. Batch/`ImportReview` integracija (najveći zahvat).

Prije popravka 1. i 2. potrebno je vidjeti **sirovi Enable Banking odgovor** za sporne transakcije — inače popravljamo po hipotezi.
