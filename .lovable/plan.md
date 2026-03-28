

# Plan: Gantt strelice ovisnosti na Timeline tabu

## Što se gradi

Dodavanje SVG strelica između Gantt barova na Timeline tabu koje vizualno prikazuju ovisnosti (`depends_on_milestone_id`). Strelica ide od kraja preduvjetne faze do početka ovisne faze.

## Implementacija

### Datoteka: `src/components/projects/ProjectTimelineTab.tsx`

1. **Izračun pozicija za strelice** — novi `useMemo` koji za svaki milestone s `depends_on_milestone_id` izračunava:
   - Kraj (desni rub) bara preduvjetne faze → početna točka strelice
   - Početak (lijevi rub) bara ovisne faze → krajnja točka strelice
   - Vertikalna pozicija bazirana na indeksu milestona u listi (svaki red je ~44px visok: info row + bar)

2. **SVG overlay** — apsolutno pozicionirani `<svg>` element preko Gantt barova sekcije koji crta strelice:
   - Svaka strelica je `<path>` s Bézier krivuljom za glatki prijelaz
   - Koristi `marker-end` za vrh strelice (arrow marker definiran u `<defs>`)
   - Boja strelice: `text-muted-foreground` (siva), s opcijom da se poklopi s bojom preduvjetne faze

3. **Legenda** — dodati stavku "Ovisnost" u legend s ikonom strelice

4. **Labela** — tooltip ili mali tekst pored strelice koji kaže "ovisi o: [ime faze]" (već postoji u info redu kao opcija)

### Tehnika crtanja

```text
  [Faza A bar ======]
                      ╲
                       ╲  (SVG Bézier path)
                        ↘
                         [Faza B bar ======]
```

- Wrappati Gantt barove sekciju u `relative` kontejner
- SVG pokriva cijeli kontejner, `pointer-events: none`
- Koristiti `useRef` za mjerenje stvarnih visina redova, ili računati fiksne pozicije (svaki milestone row ~ 52px)

### Bez promjena baze
Sve koristi postojeći `depends_on_milestone_id` field.

