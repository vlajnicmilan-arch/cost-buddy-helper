

# Analiza: Prikaz troškova po izvoru plaćanja u projektu Duje

## Nalazi iz baze podataka

| Metrika | Vrijednost |
|---|---|
| Ukupno transakcija u projektu Duje | 172 (odobrenih) |
| Ukupni troškovi projekta | 11.999,05 € |
| PBZ Solin kredit troškovi u projektu | 17 transakcija = **1.734,00 €** |
| PBZ Solin kredit troškovi ukupno (svi projekti + osobno) | 41 transakcija = **5.374,24 €** |

## Zaključak

**Filtriranje radi ispravno.** Kada odabereš "PBZ Solin kredit" u projektu Duje, prikazuje se samo 17 transakcija (1.734 €) jer su **samo te transakcije dodijeljene tom projektu**. Ostalih 24 PBZ Solin transakcija (3.640 €) su osobne ili pripadaju drugim projektima.

Razlika između 1.734,44 € (što vidiš) i 1.734,00 € (u bazi) — 0,44 € — može biti floating point zaokruživanje.

## Mogući koraci

Ako želiš da više PBZ Solin transakcija bude u projektu Duje, potrebno je:
1. **Ručno dodijeliti** postojeće transakcije projektu (editirati transakciju i dodati project_id)
2. **Ili dodati "Bulk assign to project"** — opciju za masovno dodjeljivanje transakcija projektu iz glavnog popisa

### Tehnički detalj — prevencija budućih problema
`useProjectStats.ts` trenutno nema paginaciju (koristi jedan `.select()` poziv). Projekt Duje ima samo 172 transakcija pa to sada nije problem, ali kad naraste iznad 1000 trebat će isti fix kao u `useExpenseFetch.ts`.

## Predložene promjene

| Datoteka | Promjena |
|---|---|
| `src/hooks/useProjectStats.ts` | Dodati paginaciju (isti pattern kao useExpenseFetch) |

Ako trebaš i mogućnost masovnog dodjeljivanja transakcija projektu, to je veća funkcionalnost koju mogu isplanirati zasebno.

