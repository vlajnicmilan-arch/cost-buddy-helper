
# Dijagnoza — SAMO NALAZ, BEZ IZMJENA

Source: `custom:99f9425d-f37c-44ea-81b9-3d10e311b44d` ("Tekući zaštićeni"), Milan.

## 1. Transakcija iz 2028

| Polje | Vrijednost |
|---|---|
| id | `974aeebc-781d-4cbd-b444-ce1b657fc9b8` |
| type | expense |
| amount | **4,82 EUR** |
| description | "Tjedna kupovina" |
| category | groceries |
| event_at | **2028-06-26** 10:00 UTC |
| date | 2028-06-26 |
| created_at | **2026-06-28** 15:42 UTC |
| expense_nature | (prazno) |

**Interpretacija:** kreirana 28.6.2026, ali user je upisao datum događaja 26.6.**2028** (tipfeler — 2028 umjesto 2026, razlika točno dvije godine). Nije transfer, nije correction. Sitan iznos.

## 2. Utjecaj na trenutni saldo

Engine (`_expenses_recompute_source_balance`) koristi **event_at** za cutoff, **bez gornje granice** — buduće transakcije se broje.

Stanje sidra: `correction_anchor_balance = 7,30`, `correction_anchor_date = 2026-07-07 05:32 UTC`, `anchor_source = user_confirmed`.

Post-anchor agregat (event_at > 2026-07-07):

| kategorija | count | zbroj |
|---|---:|---:|
| expense regular | 6 | 735,95 |
| expense (bez nature) — **2028-tx** | 1 | 4,82 |
| income regular | 2 | 655,99 |

Izračun: `7,30 + 655,99 − 740,77 = **−77,48**` ✓

**App prikazuje točno ono što baza računa.** Nema drifta unutar engine izračuna — moja prethodna dijagnoza ("drift 67,60") bila je **kriva**: pogrešno sam sumirao post-anchor delta kao −152,38. Ispravan neto je −84,78, i formula se poklapa u cent.

2028-transakcija **jest** uračunata u −77,48 (jer engine nema future-cutoff), ali doprinosi tek 4,82 EUR.

## 3. Prava razlika app vs banka

- App: **−77,48**
- Banka javlja: **57,34**
- Razlika: **134,82 EUR**

To NIJE artefakt engine-a. Objašnjenja su drugdje:

a) **Sidro 7,30 je vjerojatno bilo krivo od početka.** Postavljeno backfill migracijom kao `user_confirmed`, ne iz banke.
b) **Nedostaju bankovne transakcije** između 7.7.2026 i danas koje bi objasnile razliku (npr. dolazne uplate koje app ne vidi jer Enable Banking sync ne pokriva ovaj račun / IBAN nije mapiran).
c) 2028-tipfeler je **kozmetički problem** (4,82 EUR), ne uzrok razlike.

## 4. Zaključak

- 2028-transakcija = greška u datumu (tipfeler 2028 umjesto 2026), iznos 4,82 EUR, marginalan utjecaj.
- Nema bug u recomputeu — formula sidro + post-anchor delta odgovara prikazu.
- Razlika 134,82 vs banka dolazi iz (a) potencijalno krivog sidra 7,30 i/ili (b) nedostajućih bankovnih transakcija u aplikaciji.

## 5. Opcije popravka (SAMO OPIS, ne izvršavam)

Za 2028-transakciju:
- **A)** Ispraviti `event_at` i `date` na 2026-06-26 (najvjerojatniji stvarni datum, poklapa se s created_at).
- **B)** Obrisati ako je duplikat neke postojeće 2026 transakcije (treba provjeriti).

Za razliku 134,82 vs banka (odvojena odluka):
- **C)** Poravnati sidro na trenutni bankin saldo 57,34 s današnjim datumom (odsjeca povijest, ne objašnjava razliku).
- **D)** Prvo istražiti zašto sync ne povlači nove bankovne redove, pa tek onda odlučiti o sidru.

**Milan odlučuje. Ne izvršavam ništa bez izričitog "gradi".**
