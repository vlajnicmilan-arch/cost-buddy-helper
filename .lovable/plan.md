## Cilj
Preraditi karticu projekta u `ActiveProjectsStrip` tako da:
1. Marža se računa **uvijek** iz: `(ugovoreno − trošak) / ugovoreno × 100`
   - `ugovoreno` = `total_budget` (ugovorena vrijednost projekta)
   - `trošak` = `spent`
   - `zarada` = `total_budget − spent`
2. Marža je **glavna informacija**, ali vizualno manja i proporcionalnija kartici.

## Logika prikaza

### Slučaj A — projekt ima ugovoreni iznos (`total_budget > 0`)
- Marža = `(budget − spent) / budget × 100`
- Label: **MARŽA**
- Footer 3 linije:
  - Ugovoreno: `budget €`
  - Trošak: `spent €`
  - Zarada: `budget − spent €` (zeleno/crveno po znaku, s prefiksom + / −)

### Slučaj B — nema ugovorenog iznosa
- Centralni CTA: **„Postavi ugovoreni iznos"** (klik = otvara projekt)
- Bez marže, bez footera

`income` se više **ne koristi** za izračun marže (uklanjamo „STVARNA / PREDVIĐENA" razlikovanje — jedna formula, jedna istina).

## Vizualni redizajn (proporcije)

Trenutno: marža `text-3xl` (30px) djeluje predimenzionirano za 200×210 karticu.

Prijedlog:
- Marža: `text-2xl` (24px) `font-bold tabular-nums` — glavni fokus, ali nije agresivno velika
- Label „MARŽA": `text-[10px] uppercase tracking-wider` ispod broja
- Header (ikona + ime + semafor): bez promjene
- Footer: `text-[11px]` — bez promjene
- Visina kartice: smanjiti s `min-h-[210px]` na `min-h-[190px]` (manje praznine oko marže)
- Razmak: centerpiece `py-0.5` umjesto `py-1`

Semafor (kružić u headeru) ostaje neovisan signal:
- ≥30% zeleno, 10–30% žuto, <10% crveno

## Tehničke izmjene

**Datoteka:** `src/components/home/ActiveProjectsStrip.tsx`

1. `MarginKind` se reducira na `'margin' | 'none'` (uklanja se `real`/`expected`).
2. `ProjectCardData`: ukloniti `income`, `kind` postaje boolean ima li marže.
3. Izračun marže — uvijek iz `total_budget` i `spent`. Ako `budget <= 0` → `kind = 'none'`.
4. Footer linije — uvijek 3: Ugovoreno / Trošak / Zarada.
5. `renderCenter`: `text-2xl` umjesto `text-3xl`, jedan label „MARŽA".
6. `renderFooterLines`: uklanja se grananje real/expected.
7. CTA u slučaju B: tekst „Postavi ugovoreni iznos".
8. `min-h-[210px]` → `min-h-[190px]` (i kod skeleton i kod „Novi projekt" CTA kartice radi konzistentnosti).

## i18n promjene

`src/i18n/locales/{hr,en,de}.json` pod `projects.card.*`:
- `margin`: „MARŽA" / „MARGIN" / „MARGE"
- `contracted`: već postoji („Ugovoreno")
- `spent`: već postoji
- `profit`: „Zarada" / „Profit" / „Gewinn" (re-using postojeći ključ ako postoji)
- `setContracted`: „Postavi ugovoreni iznos" / „Set contracted amount" / „Vertragsbetrag festlegen"

Uklanjaju se (ako se ne koriste drugdje): `realMargin`, `expectedMargin`, `collected`, `remaining`, `setBudget`.

## Što se NE dira

- `useActiveProjectsSummary` (i dalje vraća `income`, samo ga ne koristimo ovdje)
- `projectHealthScore.ts`, `ProjectCard.tsx`, ostali ekrani projekta
- Logika navigacije, klika, haptics
