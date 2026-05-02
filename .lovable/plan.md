## Cilj

Na glavnom dashboardu (sekcija "Aktivni projekti") preraditi kartice tako da:

1. **Semafor postaje vizualni centar** kartice — velik, jasan, emocionalan.
2. **Boja semafora ovisi o profitnoj marži** (profit / ukupni prihod ili budžet projekta):
   - Zeleno: marža ≥ 30%
   - Žuto: marža < 30% (warning)
   - Crveno: marža < 10% (critical)
3. Na kartici se uvijek **vidi iznos profita** (i postotak marže).
4. Kod žute/crvene **AI generira kratko upozorenje** (1 rečenica), prikazano ispod ili u tooltipu.
5. Kartice se po potrebi **povećaju** (trenutno 150–170px wide / 110px high → veće da stane semafor + KPI + warning).

## Promjene u kodu

### 1. `src/components/home/ActiveProjectsStrip.tsx` (glavni rad)

- **Nova logika `health`** za "income-bearing" projekte:
  - `margin = profit / income`
  - `margin < 0.10` → `red`
  - `margin < 0.30` → `yellow`
  - `margin ≥ 0.30` → `green`
  - Za projekte bez prihoda zadržati postojeću budget-based logiku.
- **Novi `BigTrafficLight` komponenta** (zamjenjuje mali u uglu):
  - 3 horizontalna kruga ~14px svaki, samo aktivni svijetli s glow + pulsiranjem (yellow/red).
  - Smješten u headeru kartice, lijevo od KPI-ja, ne više u uglu.
  - Emocionalni efekt: yellow = blagi pulse (2s), red = brži pulse (1s) + suptilni shake.
  - Tooltip s kratkim opisom statusa.
- **Layout kartice**:
  - Min-width 180px, min-height 150px (s mjesta za warning red).
  - Header: ikona + ime projekta.
  - Centralni red: **veliki semafor** + vrijednost profita (npr. `+1.250 €`) + marža u % (`24%`).
  - Footer: AI upozorenje (1 rečenica, samo za yellow/red) ili izostavljeno.
- Ako projekt nema prihoda, prikazati postojeći KPI (remaining/items) bez marže.

### 2. AI upozorenje (lightweight, bez novih API poziva)

- Da izbjegnemo trošak/latenciju na svaki render dashboarda, **AI tekst se generira lokalno** iz template-a temeljem statusa:
  - `yellow` (margin <30%): npr. "Marža je niska ({pct}%) — provjerite troškove."
  - `red` (margin <10%): "Profit ispod 10% — projekt je ugrožen."
- Tekstovi su **i18n ključevi** (`projects.health.aiWarning.yellow`, `.red`) u sva 3 jezika (HR, EN, DE).
- Kasnije se može uplugati `project-insights` edge function za detaljnije poruke (out of scope za sad).

### 3. i18n (`hr.json`, `en.json`, `de.json`)

Dodati pod `projects.health`:
- `margin` ("Marža")
- `aiWarning.yellow` ("Marža {{pct}}% — pregledajte troškove projekta.")
- `aiWarning.red` ("Marža {{pct}}% — profit kritičan, hitna intervencija.")
- `trafficLight.green` / `.yellow` / `.red` (tooltip labeli)

### 4. Stil & a11y

- Boje preko HSL tokena: `--income`, `--warning`, `--destructive`.
- Pulsiranje preko Tailwind `animate-pulse` ili custom keyframe u `index.css` (`@keyframes traffic-pulse-warn` / `-crit`).
- Min touch target ostaje 44px (cijela kartica je klikabilna).
- ARIA: `role="img"` + `aria-label` za semafor (npr. "Status projekta: kritično, marža 6%").

## Što se NE mijenja

- Hookovi za dohvat podataka (`useActiveProjectsSummary`) ostaju isti — već vraćaju `spent`/`income`.
- Ostale rute, projekti page (`ProjectCard.tsx`) — ne diramo, ovo je samo dashboard strip.
- Bez DB migracija, bez novih edge functiona.

## QA

- Provjeriti 3 scenarija po projektu: (a) profit ≥ 30% → zeleno, mirno, (b) 10–30% → žuto + pulse + warning text, (c) <10% → crveno + brže pulse + warning.
- Provjeriti projekte bez prihoda (zadržava staru logiku).
- Mobilni viewport 384px — kartice ne lome layout, horizontalni scroll radi.
- HR/EN/DE tekstovi lokalizirani.
