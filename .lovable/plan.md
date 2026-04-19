

## Što se događa

Kad korisnik klikne **"Osobno"** u `BusinessProfileSwitcher`, poziva se samo `setActiveBusinessProfileId(null)` — ali **`businessModeEnabled` ostaje `true`** u `localStorage` i u kontekstu.

Zatim se aktivira novi auto-select fallback iz `useProjects.ts` (linije 130-149) koji sam dodao u prošlom krugu:

```ts
if (!user || !businessModeEnabled || activeBusinessProfileId) return;
// → Učitava prvi business profil i poziva setActiveBusinessProfileId(firstId)
```

Pošto je `businessModeEnabled === true` i `activeBusinessProfileId === null` (jer ga je korisnik upravo nullao), fallback **odmah ponovno aktivira prvi poslovni profil** — i korisnik je vraćen u Business mod. Beskonačna petlja iz korisničke perspektive.

## Što ću popraviti (2 mala fixa)

### 1) `BusinessProfileSwitcher` — kad korisnik klikne "Osobno", ugasiti i `businessModeEnabled`

Klik na Personal sada poziva i `setBusinessModeEnabled(false)` zajedno s `setActiveBusinessProfileId(null)`. Klik na konkretan poslovni profil pali oboje (`true` + ID).

### 2) `useProjects` auto-select fallback — sužen okidač

Auto-select smije reagirati **samo nakon prihvaćanja shared business projekta** (race condition iz prošlog krugа), a ne svaki put kad korisnik svjesno klikne "Osobno".

Rješenje: dodati guard koji aktivira fallback samo ako postoji barem jedna `project_members` row s `member_context = 'business'` za trenutnog korisnika **I** `activeBusinessProfileId === null` **I** `businessModeEnabled === true`. Time:
- Vlasnici Pro/Business pretplate koji ručno kliknu "Osobno" → fallback se neće aktivirati jer `businessModeEnabled` je sad `false` (točka 1).
- Pridruženi članovi koji upravo prihvate business projekt → fallback i dalje radi jer je `businessModeEnabled` ostao `true` iz acceptance flowa.

Dodatno: ako iz nekog razloga `businessModeEnabled` ostane `true` a korisnik nema niti jedan business profile niti shared business project, **ugasiti `businessModeEnabled`** kao saniranje stanja.

## Datoteke koje mijenjam

- `src/components/BusinessProfileSwitcher.tsx` — koristiti `setBusinessModeEnabled` iz konteksta pri kliku na Personal/Business
- `src/hooks/useProjects.ts` — auto-select fallback samo kad postoji shared business membership

## Što NE mijenjam

- `BusinessModeGuard.tsx` — radi ispravno
- Bazu, RLS, Edge funkcije — sve je OK

