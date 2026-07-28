## Nalaz (provjereno u kodu)

**Kako kartice sad dobivaju rub i sjaj**

1. `src/components/home/SummarySection.tsx` — kartice "Slobodno", "Neto vrijednost", "Ukupni prihodi", "Ukupni troškovi", "Transferi" su `motion.div` s klasama `p-3 rounded-2xl border border-border/50 backdrop-blur-md` i **inline `style`**:
   - `borderLeftWidth: 3`, `borderLeftColor`: `hsl(var(--primary))` (Slobodno), `hsl(168 80% 50%)` (Neto vrijednost, hardkodirano), `hsl(var(--income))` (prihodi), `hsl(var(--destructive))` (troškovi), `hsl(var(--muted-foreground))` (transferi)
   - inline `background` linear-gradient iste boje + radial "blob" 0.06
   - `boxShadow` samo na `whileHover` (framer), statički box-shadow nemaju.
2. `src/components/wallet/WalletHeroCard.tsx` — `rounded-2xl border bg-card`.

**Zašto su zlatne jače:** Onyx pravilo u `index.css` (linije 276–285) hvata samo `.glass-card` i `[class*='rounded-2xl'].bg-card` → `--shadow-premium` (zlatni hairline + dubina) dobiva **samo** WalletHeroCard i slične `bg-card` kartice. Summary kartice nemaju `bg-card` ni `glass-card`, pa ne dobivaju `--shadow-premium` uopće; njihov "sjaj" je samo blagi inline gradijent. Kartice koje ipak izgledaju zlatno-sjajno to su jer im je akcent `--primary` (= zlato u Onyxu).

## Zašto se ne može čisto samo u index.css

Boje rubova su **inline** po kartici. CSS ne može pročitati `border-left-color` i ubaciti ga u `box-shadow`. Selektori tipa `.income-card` ne postoje — nema klasa po tipu kartice. Jedina "čisto CSS" alternativa bila bi hvatati kartice po redoslijedu (`:nth-child`), što je krhko i puca kad je `compact` mod aktivan (tada se renderiraju samo 2 kartice).

## Predloženi najčišći put (traži Milanovo odobrenje za 1 komponentu)

**Korak 1 — SummarySection.tsx (samo prezentacija, bez logike):**
Svakoj kartici u inline `style` dodati CSS varijablu s njezinom akcentnom bojom, npr.:
```
style={{ ['--card-accent' as string]: 'var(--income)', borderLeftWidth: 3, borderLeftColor: 'hsl(var(--income))', ... }}
```
- Slobodno → `var(--primary)`
- Neto vrijednost → `168 80% 50%` (ostaje ista boja)
- Prihodi → `var(--income)`
- Troškovi → `var(--destructive)`
- Transferi/Recurring → `var(--muted-foreground)` (ili `--primary` kao neutralno — na odabir)

Nikakva promjena boja, teksta, klasa ni logike — samo dodatak varijable.

**Korak 2 — index.css, isključivo unutar `.business-theme-premium-dark`:**
```
--shadow-premium-accent:
  inset 0 1px 0 hsl(var(--card-accent, 40 50% 88%) / 0.22),
  inset 0 -1px 0 hsl(30 8% 2% / 0.40),
  0 8px 32px -14px hsl(0 0% 0% / 0.95),
  0 0 24px -10px hsl(var(--card-accent, 40 55% 48%) / 0.35);
```
i pravilo koje ga primjenjuje na summary kartice unutar teme:
```
.business-theme-premium-dark [class*='rounded-2xl'][class*='backdrop-blur-md'] { box-shadow: var(--shadow-premium-accent); }
```
Postojeće `.glass-card` / `.bg-card` pravilo također prebaciti na `--shadow-premium-accent` s fallbackom na zlato, tako da zlatne kartice ostanu identične kao sad, a obojene dobiju istu jačinu u svojoj boji.

**Jačina:** identična onoj koju je Milan odobrio na zlatnima (highlight 0.14 baza; kod obojenih se koristi ~0.22 jer su boje tamnije od šampanjca — kalibrirat ću vizualno da percipirana jačina bude ista).

## Što ostaje netaknuto
- Semantika boja (zeleno = prihod, crveno = trošak) — nepromijenjena
- Onyx paleta (`--background`, `--primary`, `--accent`…) — nepromijenjena
- Druge teme, biznis logika, balance/settlement — nedirnuto

## Verifikacija
- `npm test` (očekivano 2114 PASS)
- Screenshot Onyx dashboarda (Playwright) radi vizualne potvrde jednake jačine
- Commit + SHA u izvješću

**Potrebno odobrenje:** dodirivanje `SummarySection.tsx` (dodavanje `--card-accent` varijable). Bez toga se zahtjev ne može izvesti stabilno.
