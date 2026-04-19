

## Problem
Klikom na obiteljsku grupu unutar `/family`, prikaz detalja grupe se otvara ali je scroll pozicija na dnu umjesto na vrhu.

## Uzrok
Otvaranje detalja grupe **NIJE promjena rute** — vjerojatno je to in-page state (npr. `selectedGroup`) ili dijalog/full-screen view unutar iste `/family` rute. Zato globalna `ScrollToTop` (koja sluša `pathname`) ne reagira.

## Rješenje
U `src/pages/Family.tsx` dodati `useEffect` koji resetira `window.scrollTo(0, 0)` kad se promijeni stanje odabrane grupe (kad korisnik uđe u detalj grupe).

### Datoteke
- **Izmjena**: `src/pages/Family.tsx` — `useEffect` na promjenu odabrane grupe → scroll to top

### Što NE diram
- `FamilyGroupDetailView`, `FamilyGroupCard`, logiku odabira grupe
- Ostale stranice, globalni `ScrollToTop`

