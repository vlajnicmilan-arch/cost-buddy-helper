
# Mobile tab nav — Opcija A (fiksni raspored) — implementacijski plan

## Konačan model (odobreno)
- 4 primarna taba uvijek u istom redoslijedu: `Overview`, `Budget`, `Phases`, `Team`.
- 5. slot uvijek `Više` (otvara bottom sheet sa svim ostalim vidljivim tabovima).
- Sastav primarnog reda se NIKADA ne mijenja ovisno o tome što je aktivno.
- Ako je aktivan tab iz "Više" grupe → samo mali indikator (točka) na `Više` gumbu + selekcija u sheetu. Primarni red ostaje neoznačen.
- Postojeći fade (`ProjectTabsStrip`) UKLANJA SE na mobilu — nema više horizontalnog scrolla pa nije potreban. Desktop netaknut (puni TabsList ostaje).

## Skup tabova u "Više" grupi
Sve što nije u primarnih 4, a `canSeeTab(key)` vraća true:
`funding`, `transactions`, `worklog`, `documents`, `activity`.

Brojač pored "Više" pokazuje koliko ih je stvarno dostupno korisniku (nakon visibility filtra). Ako je 0, gumb `Više` se ne renderira.

## Edge case: worker-only
Worker vidi samo `worklog`. Za njega:
- Primarni red bi imao 4 disabled slota — to je loše.
- Rješenje: ako je `isWorkerOnly` true → preskačemo MobileProjectTabs i renderiramo postojeći jednostavni TabsList s jedinim vidljivim tabom (već radi).

## Što se točno mijenja

### Nove datoteke
1. `src/components/projects/MobileProjectTabs.tsx` (~150 lina):
   - Props: `value`, `onValueChange`, `visibleTabs: string[]`, `labels: Record<string,string>`, `icons: Record<string, LucideIcon>`.
   - Render: 5-stupčani grid (4 primarna + Više). Svaki slot je `<button>` s `role="tab"`, `aria-selected`, min 44px touch.
   - Bottom sheet (shadcn `Sheet` side="bottom"): lista overflow tabova kao `<button>` redovi s ikonom + labelom, aktivni dobiva teal accent.
   - Indikator: ako `value` ∈ overflow → mala `bg-primary` točka apsolutno pozicionirana u kutu `Više` gumba.
   - Primarni tab koji nije u `visibleTabs` (npr. user nema `phases`) prikazuje se kao disabled placeholder — NE, bolje: prikazuje se normalno ako je u primarnoj listi I vidljiv; inače taj slot pada u overflow. Drugim riječima primarni red = `PRIMARY ∩ visibleTabs`, pa ostatak ide u "Više". Ako je `PRIMARY ∩ visibleTabs` < 4, slotovi ostaju prazni (ne pomičemo overflow tabove gore — fiksni raspored).
   - Konačna odluka: prazne slotove NE renderiramo kao prazne kvadrate — samo skratimo grid. Time fiksnost ostaje (Overview je uvijek prvi, Budget drugi itd., samo neki nedostaju ako user nema pristup). To je u skladu sa "stabilnim modelom" — pozicija je fiksna, ne promjenjiva.

### Izmjene
2. `src/components/projects/ProjectFullScreenView.tsx`:
   - `<div className="sm:hidden">` → `<MobileProjectTabs …/>` (samo ako nije worker-only).
   - `<div className="hidden sm:block">` → postojeći `<TabsList>` netaknut.
   - Worker-only grana: postojeći jednostavni TabsList ostaje.

### Brisanja
3. `src/components/projects/ProjectTabsStrip.tsx` — brisanje (nigdje drugdje se ne koristi, provjeriti `rg`).
4. Uklanjanje `scroll-pl-2` klase ako je dodana samo radi stripa.

### i18n
5. Nove HR/EN/DE ključeve:
   - `projects.tabs.more` = "Više" / "More" / "Mehr"
   - `projects.tabs.moreSheetTitle` = "Sve sekcije" / "All sections" / "Alle Bereiche"

## Što se NE dira
- `canSeeTab` semantika (`resolveProjectTabVisibility`).
- `resolveLegacyTabAlias` (initialTab mapping).
- Desktop TabsList.
- Worker-only flow.
- Business logika, permission semantika, delete/archive/dashboard.
- DB, RPC, dependency.

## Verifikacija
- `npm test` zelen.
- Preview na 390px: 5 slotova vidljivih bez scrolla, sheet se otvara, indikator radi za overflow tabove, primarni red statičan pri navigaciji.
- Desktop preview: nepromijenjeno.
- Worker user: vidi samo worklog (postojeći flow).
