
## Problem

Korisnik je primijetio: poslovni switcher u zaglavlju sada je **uvijek vidljiv** ako postoji bar jedan poslovni profil — čak i kad korisnik u **Postavkama** ima isključen "Poslovni mod" prekidač.

To je nuspojava prošlog popravka. U `BusinessProfileSwitcher.tsx` smo uklonili uvjet koji je skrivao komponentu kad je `businessModeEnabled === false`, ali smo time slučajno zaobišli i **glavni master prekidač** iz Postavki.

## Što treba

Postoje **tri** različita stanja koja se moraju razlikovati:

1. **Master prekidač u Postavkama** (`businessModeEnabled` u Postavkama) — "Želim li uopće vidjeti poslovne funkcije u aplikaciji?"
2. **Trenutni view** (osobni vs poslovni ekran) — "Što sad gledam?"
3. **Zapamćena tvrtka** (`activeBusinessProfileId`) — "Koja je zadnja tvrtka koju sam koristio?"

Trenutno smo #1 i #2 spojili u istu varijablu (`businessModeEnabled`), pa kad jedno gasimo, gasimo i drugo.

## Istraga koju moram napraviti

Prije nego predložim popravak, trebam pogledati:
- `src/contexts/AppStateContext.tsx` — kako je sada strukturirano stanje
- `src/components/settings/` — gdje je master prekidač u Postavkama i koju varijablu koristi
- `src/components/BusinessProfileSwitcher.tsx` — trenutni uvjet vidljivosti
- `src/pages/Index.tsx` — kako se odlučuje o prikazu

## Predložena strategija (visoki nivo)

Razdvojiti master prekidač iz Postavki od dnevnog view-toggla:

- **`businessFeatureEnabled`** (novo, iz Postavki) — master sklopka. Ako je `false`, switcher je nevidljiv, poslovni mod nedostupan.
- **`businessViewActive`** (preimenovano `businessModeEnabled`) — trenutni view. Resetira se na `false` pri startu.
- **`activeBusinessProfileId`** — pamti se kao i sad.

Switcher je vidljiv samo ako: `businessFeatureEnabled === true` **I** postoji bar 1 poslovni profil.

**Alternativa (manji rez):** Ne uvoditi novu varijablu, samo dodati provjeru postavke iz Postavki (gdje god se ona čuva — vjerojatno localStorage ključ) u `BusinessProfileSwitcher` i u `Index.tsx`.

## Pitanja prije plana

Trebam razjasniti gdje točno se nalazi taj "master prekidač" u Postavkama da znam koju varijablu koristi, jer u kodu vidim samo `businessModeEnabled` koji sad služi i kao trenutni view. Pogledat ću kod prije finalnog plana — ali već sad znam smjer popravka.

## Konkretan plan popravka

**1. Pronaći master prekidač u Postavkama** i utvrditi koristi li istu varijablu `businessModeEnabled` ili nešto drugo (npr. localStorage `business_feature_enabled`).

**2. Ako koristi istu varijablu** → uvesti razdvajanje:
- `businessFeatureEnabled` (perzistentno, kontrolirano iz Postavki) — kontrolira VIDLJIVOST switchera
- `businessViewActive` (sesijski, default `false`) — kontrolira AKTIVNI VIEW

**3. `BusinessProfileSwitcher.tsx`**: prikazuj samo ako `businessFeatureEnabled && profiles.length > 0`.

**4. `Index.tsx`**: poslovni view se renderira samo ako `businessFeatureEnabled && businessViewActive && activeBusinessProfileId`.

**5. Postavke**: prekidač "Poslovni mod" sada kontrolira `businessFeatureEnabled`. Kad ga isključiš → switcher nestaje, view se vraća na osobni, ali zapamćena tvrtka se ČUVA (vraća se kad ponovo uključiš).

**6. Migracija stanja**: postojeći korisnici koji su imali `businessModeEnabled = true` trebaju automatski dobiti `businessFeatureEnabled = true` da im se ništa ne pokvari.

## Datoteke koje ću mijenjati
- `src/contexts/AppStateContext.tsx` — uvesti `businessFeatureEnabled`, zadržati `businessModeEnabled` kao session view-flag
- `src/components/BusinessProfileSwitcher.tsx` — provjera `businessFeatureEnabled` umjesto `businessModeEnabled`
- `src/pages/Index.tsx` — uskladiti uvjet prikaza
- `src/components/settings/` (točan file utvrdit ću čitanjem) — prekidač spojiti na `businessFeatureEnabled`

## Što se NE dira
- `BusinessModeGuard.tsx`
- Push/in-app notifikacije
- Auto-generirani fileovi
- Logika podataka, RLS, edge funkcije

## Rezultat
- Postavke → "Poslovni mod" ISKLJUČEN: switcher u zaglavlju nestaje, app radi kao čisto osobna
- Postavke → "Poslovni mod" UKLJUČEN: switcher se pojavi, otvoriš app u osobnom view-u, jednim klikom u zadnju tvrtku
- Tvoj zadnji izbor tvrtke pamti se neovisno o tome jesi li trenutno u osobnom ili poslovnom view-u
