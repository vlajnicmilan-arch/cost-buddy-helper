

# Plan: Popravak prikaza izvještaja na mobitelu (Vinkini bugovi)

## Problemi koje Vinka prijavljuje

Svi problemi su u `src/components/reports/ReportsDialog.tsx`:

1. **Odsječeni iznosi u proširenim kategorijama** — Kad klikne na kategoriju (npr. Zdravlje) da vidi transakcije, iznosi desno su odsječeni (-7 umjesto -7,50 €, -105 umjesto -105,00 €). Uzrok: `ml-5` + `pl-3` na transakcijskom kontejneru smanjuju dostupan prostor, a na 384px ekranu nema mjesta za cijeli iznos.

2. **Pie chart labele izlaze van ekrana** — Imena kategorija oko donut charta (npr. "Obrazov...", "Odjeća 6%") su odsječena desno. Uzrok: `label` prop renderira puno ime + postotak izvan granica `outerRadius`, a `ResponsiveContainer` ne može skratiti SVG tekst.

3. **Stupci (bar chart) se ne mogu prikazati** — Toggle tipke za pie/bar su premale za dodir na mobitelu. Tipke imaju `h-7 px-2` (28px visine) — ispod minimuma od 44px.

## Promjene

### Datoteka: `src/components/reports/ReportsDialog.tsx`

**1. Proširene transakcije — smanjiti lijevi margin (linija ~986)**
- Smanjiti `ml-5 pl-3` na `ml-3 pl-2` kako bi transakcije imale više prostora desno
- Dodati `overflow-hidden` na roditeljski kontejner

**2. Pie chart labele — skratiti na mobilnom (linija ~905)**
- Zamijeniti inline label s kraćim formatom: prikazati samo postotak (`${(percent*100).toFixed(0)}%`) umjesto punog imena
- Alternativno: ukloniti `label` prop i osloniti se na Tooltip za detalje

**3. Toggle tipke — povećati touch target (linija ~873-889)**
- Povećati tipke na `min-h-[44px] min-w-[44px]` za mobilni dodir
- Dodati `touch-manipulation` klasu

**4. Dialog širina na mobilnom (linija ~658)**
- Dodati `w-[calc(100vw-1rem)]` za mobilni kako bi dialog koristio puni ekran

## Očekivani rezultat
- Iznosi u proširenim kategorijama vidljivi u cijelosti (s centima i €)
- Pie chart labele se ne odsijecaju
- Toggle pie/bar radi na dodir
- Bolje iskorištenje prostora na 384px ekranu

