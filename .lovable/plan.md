# 3 dizajn-direkcije za kartice na dashboardu

Cilj: vizualno razlikovati **Novčanik / Projekt / Budžet** kartice **bez** mijenjanja oblika (zadržava se isti radius, shadow, grid). Diferencijacija ide kroz boju + ikonografiju + suptilne grafičke detalje.

Boje po tipu (predloženo, sve HSL u semantičkim tokenima):
- **Novčanik** → teal `172 66% 40%` (već primary)
- **Projekt** → amber `38 92% 50%`
- **Budžet** → violet `262 60% 55%`

---

## Direkcija A — "Akcent-traka" (najminimalnija)

```text
┌─┬──────────────────────────────┐
│█│  [icon]  Naziv kartice    →  │
│█│  Iznos / podnaslov           │
│█│  ────────────────────────    │
│█│  meta podaci                 │
└─┴──────────────────────────────┘
 ↑
 3px traka u boji tipa
```

- Lijeva 3px vertikalna traka u boji tipa (full-height kartice)
- Sve ostalo identično trenutnom dizajnu
- Ikona u krugu (već postoji) preuzima istu boju tipa
- **Pro**: zero vizualne buke, top-tier čitljivost, savršeno za 384px
- **Con**: najsuptilnije — možda premalo vidljivo na prvi pogled

---

## Direkcija B — "Header chip + ikonska boja"

```text
┌──────────────────────────────────┐
│ ● NOVČANIK                       │  ← mali chip s pointom u boji tipa
│                                  │
│  [ICON]  Naziv kartice        →  │  ← ikona u tonalnom krugu (boja/10)
│          1.234,56 €              │
│                                  │
│  meta podaci                     │
└──────────────────────────────────┘
```

- Mali tipski chip gore lijevo (uppercase 10px, letter-spacing): `NOVČANIK` / `PROJEKT` / `BUDŽET` s točkicom u boji
- Ikona u krugu obojana u boju tipa s background `boja / 10%`
- Iznos zadržava semantičku boju (zelena/crvena/teal)
- **Pro**: jasna i čitljiva tipska oznaka, snažna hijerarhija
- **Con**: jedan dodatni redak teksta po kartici (i18n: `cards.type.wallet`, `cards.type.project`, `cards.type.budget`)

---

## Direkcija C — "Tonalni gradient + monogram pattern"

```text
┌──────────────────────────────────┐
│ ╲ ╲ ╲ ╲ ╲ ╲ ╲ ╲ ╲ ╲ ╲           │  ← suptilni dijagonalni pattern 3% opacity
│  [ICON]  Naziv kartice        →  │     u boji tipa, samo gornja trećina
│          1.234,56 €              │
│  ───────────────────────         │
│  meta                            │
└──────────────────────────────────┘
```

- Pozadina kartice = vrlo blagi linearni gradient od `boja/4%` (top-left) → transparentno
- Suptilan dijagonalni line-pattern (SVG, 3-5% opacity) samo u gornjoj trećini
- Ikona u krugu u punoj boji tipa (kao danas)
- **Pro**: najbogatiji, "premium" osjećaj, jasna diferencijacija na prvi pogled
- **Con**: najviše vizualnog šuma — može opteretiti dashboard kad ima puno kartica; pažljiv u dark modu

---

## Tehnički dio (zajednički za sve 3 direkcije)

**Tokeni** (`src/index.css`):
```css
--card-type-wallet: 172 66% 40%;
--card-type-project: 38 92% 50%;
--card-type-budget: 262 60% 55%;
```

**Tailwind** (`tailwind.config.ts`):
```ts
colors: {
  cardType: {
    wallet: 'hsl(var(--card-type-wallet))',
    project: 'hsl(var(--card-type-project))',
    budget: 'hsl(var(--card-type-budget))',
  }
}
```

**Reusable wrapper** (nova: `src/components/ui/typed-card.tsx`):
```tsx
type CardType = 'wallet' | 'project' | 'budget';
<TypedCard type="wallet">…</TypedCard>
```
Sve postojeće kartice (PaymentSource, ProjectCard u `ActiveProjectsStrip`, BudgetCard u `BudgetSection`) wrapaju se u `<TypedCard type="…">` — **postojeća logika i sadržaj se ne dira**.

**i18n** (samo direkcija B):
- `cards.type.wallet` / `project` / `budget` u sva 3 jezika (HR/EN/DE)

**Što se NE mijenja**:
- Oblik, radius, shadow, grid-spacing
- Postojeće ikone, iznosi, akcije
- Dark mode logika (tokeni su HSL → automatski rade)

---

## Sljedeći korak

Reci koju direkciju (A / B / C) implementiram, ili kombinaciju (npr. A+B = traka + chip). Mogu i napraviti A na trenutnoj instalaciji da vidiš uživo prije konačne odluke.
