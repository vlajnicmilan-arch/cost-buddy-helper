## Cilj

Dodijeliti modulsku boju **nazivima entiteta** (ne samo CTA gumbima i tabovima), tako da kartice i liste imaju jači vizualni identitet po modulu:

| Modul    | Boja      | Što oboja(va)mo (naziv/title)                  |
|----------|-----------|------------------------------------------------|
| Projekti | plava     | naziv projekta na `ProjectCard`                |
| Novčanik | zelena    | naziv izvora plaćanja na karticama izvora      |
| Budžeti  | ljubičasta| naziv budžeta na `BudgetCard`                  |
| Krug     | narančasta| naziv Kruga na `KrugListScreen` karticama      |
| Overview | teal      | ne diramo (već je primary)                     |

## Pristup (bez novih sistema)

Iskoristiti **postojeći** `MODULE_NAV_CLASSES` iz `src/lib/moduleColors.ts` (statičke literalne Tailwind klase, sigurne za purge) i primijeniti `text-*` klasu **direktno u kartici**, na konkretnom modulu — ne kroz aktivni `--module-accent` token. Razlog: kartice se renderiraju i u kontekstima gdje aktivna ruta nije tog modula (npr. projekt link na dashboardu), pa boja mora biti **vezana uz entitet**, ne uz rutu.

Pravilo: bojamo **samo naziv** (heading entiteta), ne metapodatke, ne ikone, ne iznose. Iznose i status badge-ove ne diramo (financijska semantika ostaje neutralna / status-bojama).

## Konkretne izmjene (4 fajla, 1 linija po fajlu)

1. **`src/components/projects/ProjectCard.tsx`** — `h3`/title projekta dobiva `MODULE_NAV_CLASSES.projects.text`
2. **`src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx`** — naziv izvora plaćanja dobiva `MODULE_NAV_CLASSES.wallet.text`
3. **`src/components/budget/BudgetCard.tsx`** — naziv budžeta dobiva `MODULE_NAV_CLASSES.budgets.text`
4. **`src/components/krug/KrugListScreen.tsx`** — naziv Kruga dobiva `MODULE_NAV_CLASSES.krug.text`

Klase su već u `MODULE_NAV_CLASSES`, JIT ih već vidi (koriste se u `BottomNav`), pa nema rizika od purge-a niti novih CSS varijabli.

## Što NE diramo

- Iznose, ikone, badge-ove, datume, opisni tekst — ostaju neutralni
- `--module-accent` token (i dalje vrijedi za aktivne CTA u modulu)
- Dark/light mode: HSL vrijednosti u `MODULE_NAV_CLASSES` su dovoljno zasićene za oba moda (provjereno u BottomNav-u)
- Status semantiku (destructive/warning/income/success) — ima prioritet, nikad je ne prebojavamo

## Out of scope

- Bojanje naziva u Reports/Calendar/global search listama (može kasnije, isti princip)
- Mijenjanje težine fonta ili veličine
- Bilo kakav DB ili i18n rad

Potvrdi pa idem implementirati.