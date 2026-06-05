## Cilj

Zamijeniti trenutnu Lucide ikonu na "Krug" tabu u `BottomNav` s prilagođenim simbolom: krug podijeljen na 4 luka razdvojena gapovima, svaki u jednoj boji iz `MODULE_HSL`.

## Boje (iz `src/lib/moduleColors.ts`)

| Segment | Modul | HSL |
|---|---|---|
| Gore-lijevo | Projekti | `217 91% 60%` (plava) |
| Gore-desno | Novčanik | `142 71% 45%` (zelena) |
| Dolje-lijevo | Budžeti | `258 90% 66%` (ljubičasta) |
| Dolje-desno | Krug | `25 95% 53%` (narančasta) |

Pregled (teal) namjerno izostavljen — predstavlja okvir, ne segment.

## Implementacija

1. **Nova komponenta** `src/components/krug/KrugBrandIcon.tsx`
   - SVG 24×24, `viewBox="0 0 24 24"`, prima `className` + `size`
   - 4 `<path>` luka (po 72°, 18° gap između), `stroke-linecap="round"`, `fill="none"`, `stroke-width="2.5"`
   - Boje preko `stroke={hsl(...)}` literalno (ne preko `currentColor`) jer su 4 različite — `aria-hidden`
   - Centri lukova na 45°/135°/225°/315°, redoslijed boja kao u tablici

2. **BottomNav** (`src/components/BottomNav.tsx`)
   - Pronaći stavku za rutu `/krug` i zamijeniti `icon: SomeLucideIcon` s renderiranjem `<KrugBrandIcon />`
   - Aktivno/neaktivno stanje: ikona ostaje multi-color uvijek (to je poanta brandinga); samo label i indikator i dalje koriste `MODULE_NAV_CLASSES.krug` kao i prije
   - Touch target ≥44px ostaje nepromijenjen

## Out of scope

- Header `/krug` stranice, app logo, splash, prazni state — nije traženo
- Ostali tabovi (zadržavaju svoje Lucide ikone)
- DB/i18n promjene (none)
- Version bump (samo UI, nije native promjena)

## Test

Vizualna provjera u previewu na 384px; ikona mora ostati čitljiva na ~24px i centrirana u BottomNav slotu.
