## Cilj

Modulska boja (Pregled teal / Projekti plava / Novčanik zelena / Budžeti ljubičasta / Krug narančasta) propagira **kroz cijelu dubinu modula** — duboki dijalozi, gumbi i naslovi automatski preuzimaju aktivnu boju umjesto da ostaju teal.

## Trenutno stanje (verificirano)

Infrastruktura već postoji:
- `ModuleThemeProvider` postavlja `--module-accent` na `<body>` po ruti.
- Tailwind tokeni `bg-module`, `text-module`, `border-module`, te `--module-accent-foreground` (bijela).
- `<Button variant="module">` postoji, ali ga koristi samo ~10 komponenti.

**Uzrok nekonzistentnosti:** defaultni `<Button>` koristi `bg-primary` (teal HSL 172 66% 40%), pa svi dijalozi/gumbi po dubini ostaju teal bez obzira na modul. Većina koda piše `<Button onClick={…}>` bez variant prop-a.

## Pristup — Faza 1 (globalni shift, low-risk)

### 1. `src/components/ui/button.tsx`

Promijeniti `default` variant:
- prije: `bg-primary text-primary-foreground hover:bg-primary/90`
- poslije: `bg-module text-module-foreground hover:bg-module/90`

Dodati novi `variant="primary"` (`bg-primary text-primary-foreground hover:bg-primary/90`) za rijetke slučajeve gdje treba **uvijek teal** bez obzira na modul (npr. auth ekrani po želji).

**Zašto sigurno:**
- ModuleThemeProvider mapira nepoznate rute → `overview` (teal, identično trenutnom primary). Auth/Settings/Setup ostaju teal bez ijedne izmjene.
- Sve postojeće `variant="destructive|outline|secondary|ghost|link|module"` ostaju netaknute.
- Modal dijalozi nasljeđuju modul ekrana iznad kojeg su otvoreni — to je željeno ponašanje.

### 2. `src/components/PageHeader.tsx`

Title (`<h1>`) dobiva `text-module` umjesto trenutne neutralne boje, pa naslov svake stranice (Krug, Budžeti, Projekti, Novčanik) preuzima modulsku boju. Subtitle ostaje muted.

### 3. `src/components/ui/badge.tsx` (provjera)

Ako `Badge` default koristi `bg-primary`, ostaje **netaknut** u Fazi 1 — badge-i nose semantičke statuse (success/warning/destructive) i ne smiju se modularizirati globalno. Eksplicitni `variant="module"` već postoji.

## Out of scope za Fazu 1

- Boje ikona unutar dijaloga, Card header-i, tab indikatori unutar dubokih ekrana, focus ring — to je Faza 2 nakon što vidiš efekt Faze 1.
- Status boje (destructive crveno, success zeleno, warning žuto) — moraju ostati semantičke, nikad modularizirane.
- BottomNav — već koristi `MODULE_NAV_CLASSES` točno za ovu svrhu, ne dira se.
- Auth/SetupStorage/Onboarding ekrani — namjerno ostaju teal preko fallbacka `overview`.

## Verifikacija nakon implementacije

1. Otvoriti Krug → bilo koji gumb (Novi Krug, Spremi, Obriši dialog confirm) je narančast.
2. Otvoriti Budžet detail → gumbi su ljubičasti.
3. Otvoriti Projekt → plavi. Novčanik → zeleni. Pregled → teal (nema promjene).
4. Auth ekran → ostaje teal.
5. PageHeader naslov svake stranice ima boju modula.

## Rizici

- Komponente koje su pretpostavljale teal default (npr. ako negdje ručno usklađen tekst s teal pozadinom) mogu izgledati neusklađeno. Skeniraj prvo s `rg "bg-primary"` i potvrdi da prilagođene parove nećemo polomiti — ako ih ima, prebaci ih na novi `variant="primary"`.
