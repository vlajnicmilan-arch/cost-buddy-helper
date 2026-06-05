## Cilj

Stari Lucide `Circle` simbol u Krug ekranima zamijeniti novim `KrugBrandIcon` (4-segmentni krug u modulskim bojama).

## Pronađene pozicije

Pregled koda pokazuje **samo jednu** poziciju s "old circle" simbolom u Krug flowu:

- `src/components/krug/KrugListScreen.tsx:60` — empty state, `<Circle className="w-10 h-10 ...">`

Ostale Lucide ikone u Krug komponentama (`Users`, `Crown`, `UserPlus`, `Heart`, `HomeIcon`) su **semantičke** (članovi, vlasnik, preset tip) i ne predstavljaju "simbol kruga" — ne diram ih.

`PageHeader` u `src/pages/Krug.tsx` ne prikazuje ikonu pored naslova (komponenta nema `icon` prop), pa tamo nema starog simbola za zamijeniti.

## Izmjene

**`src/components/krug/KrugListScreen.tsx`**
- Maknuti `Circle` iz lucide importa
- Dodati `import { KrugBrandIcon } from './KrugBrandIcon'`
- Zamijeniti `<Circle className="w-10 h-10 mx-auto text-module/70" strokeWidth={1.5} />` s `<KrugBrandIcon size={40} className="mx-auto" />`

## Out of scope

- Dodavanje ikone u `PageHeader` (zahtijeva novi prop, van traženog opsega)
- BottomNav (već zamijenjeno u prethodnom koraku)
- `Users`/`Crown`/`Heart` ikone (različita semantika, nisu "simbol kruga")
