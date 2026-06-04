
# Module Color System — v1.1 korekcije

Ostatak v1 plana ostaje na snazi. Mijenjaju se samo dvije točke.

## Korekcija 1 — Krug route mapping (stvarno stanje)

Provjereno u kodu:

- `src/App.tsx` registrira **obje** rute: `/krug` (komponenta `Krug`) i `/family` (legacy komponenta `Family`).
- `src/components/BottomNav.tsx` koristi **isključivo `/krug`** kao nav slot (Krug zauzima bivši Obitelj slot). `/family` više nije u nav-u — dostupan je samo kao izravna ruta.

Module mapping (`ROUTE_TO_MODULE`) zato eksplicitno pokriva oba:

```
/home      → overview
/dashboard → overview          (alias, postoji u BottomNav activePaths)
/projects  → projects
/wallet    → wallet
/budgets   → budgets
/krug      → krug              (kanonska ruta za Krug modul)
/family    → krug              (legacy entrypoint — isti modul/akcent)
*          → overview          (fallback)
```

Mapping se radi `startsWith` matchom na pathname, idemo od najduže prema najkraćoj, da `/projects/:id` također hvata `projects`. Kanonska ruta za Krug ostaje `/krug`; `/family` se samo tonira istom modulskom bojom dok god je živ legacy ekran. Kad se `/family` ukloni, dovoljno je obrisati jedan red u mapi.

## Korekcija 2 — BottomNav / module class strategija (bez runtime string klasa)

Napušta se pristup `text-[hsl(var(--module-<key>))]`. Tailwind JIT ih u praksi pokupi, ali su build/purge krhke i loše se debuggiraju. Umjesto toga koristimo **kombinaciju statički mapiranih klasa + jedinstvenog aktivnog tokena**:

### a) Aktivni token za sve module-aware surface-e izvan BottomNav-a

`ModuleThemeProvider` postavlja na `<body>`:

- `data-module="<key>"`
- inline `style.setProperty('--module-accent', hsl)` i `'--module-accent-foreground', hsl`

U `tailwind.config.ts` definirana je **jedna** boja:

```
colors: {
  module: {
    DEFAULT: 'hsl(var(--module-accent))',
    foreground: 'hsl(var(--module-accent-foreground))',
  },
}
```

Sve module-aware komponente (PageHeader dot, CTA button `variant="module"`, badge `variant="module"`, progress indicator, empty-state ikona) koriste **isključivo statičke klase**: `bg-module`, `text-module`, `bg-module/10`, `border-module/20`, `ring-module`. Nema runtime string konkatenacije — Tailwind ih garantirano vidi u izvoru.

### b) BottomNav (potrebne su sve boje istovremeno na ekranu)

BottomNav prikazuje 5 tabova; aktivni token (`--module-accent`) je samo jedan, pa nije dovoljan. Rješenje: **statička lookup mapa Tailwind klasa po modulu**, deklarirana kao konstanta u izvoru (Tailwind JIT je vidi):

```ts
// src/lib/moduleColors.ts
export const MODULE_NAV_CLASSES: Record<ModuleKey, { text: string; bg: string }> = {
  overview: { text: 'text-[hsl(172_66%_40%)]', bg: 'bg-[hsl(172_66%_40%)]' },
  projects: { text: 'text-[hsl(217_91%_60%)]', bg: 'bg-[hsl(217_91%_60%)]' },
  wallet:   { text: 'text-[hsl(142_71%_45%)]', bg: 'bg-[hsl(142_71%_45%)]' },
  budgets:  { text: 'text-[hsl(258_90%_66%)]', bg: 'bg-[hsl(258_90%_66%)]' },
  krug:     { text: 'text-[hsl(25_95%_53%)]',  bg: 'bg-[hsl(25_95%_53%)]'  },
};
```

Ključno: klase su **literalne, statičke, deklarirane u source fajlu** koji Tailwind scan-a. Nema `${}` interpolacije, nema CSS var indirekcije po ključu. BottomNav samo radi lookup `MODULE_NAV_CLASSES[item.module].text` na već postojećim, izgrađenim klasama. Build-safe, purge-safe, lako se debuggira.

Indikator traka i ikona/label aktivnog taba koriste isti par klasa iz mape. Neaktivni tabovi ostaju `text-muted-foreground` (već postojeće ponašanje).

Ako se ikad doda 6. modul, dodaje se jedan red u mapu — bez magije.

## Što se ne mijenja iz v1

- 80/20 princip, neutralna baza, status boje s prioritetom
- popis diralnih fajlova
- opseg po komponentama (BottomNav, PageHeader, jedan CTA / progress / empty-state po modulu)
- što ostaje izvan opsega (HomeHeader, BusinessBottomNav, recharts, sub-screens)
