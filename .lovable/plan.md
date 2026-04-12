

# Plan: Popravak filtera u transakcijama izvora plaćanja

## Problem

Dijalog izvora plaćanja koristi `z-[60]` (povišen u prethodnom popravku), ali Popover (kalendar za datume) i Select (kategorije, kartice) dropdowni koriste `z-50` — niži z-index. Budući da se portali renderiraju na razini `document.body`, oni završavaju **iza** overlay-a i korisnik ih ne može vidjeti niti kliknuti.

Dodatno, Calendar komponenta nema `pointer-events-auto` klasu koja je potrebna za interaktivnost unutar portala.

## Rješenje

Tri promjene:

### 1. `src/components/ui/popover.tsx` — povećati z-index
- Linija 20: `z-50` → `z-[70]`

### 2. `src/components/ui/select.tsx` — povećati z-index
- Linija 69: `z-50` → `z-[70]`

### 3. `src/components/ui/calendar.tsx` — dodati pointer-events-auto
- Linija 14: `cn("p-3", className)` → `cn("p-3 pointer-events-auto", className)`

Ove promjene osiguravaju da svi dropdown/popover elementi uvijek budu iznad bilo kojeg overlay-a, uključujući full-screen dijalog izvora plaćanja.

| Datoteka | Promjena |
|---|---|
| `src/components/ui/popover.tsx` | z-50 → z-[70] |
| `src/components/ui/select.tsx` | z-50 → z-[70] |
| `src/components/ui/calendar.tsx` | dodati pointer-events-auto |

