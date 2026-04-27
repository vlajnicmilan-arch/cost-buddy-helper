# Pojednostavljenje project kartica na Home screenu

## Cilj
Smanjiti kognitivno opterećenje na project karticama u `ActiveProjectsStrip` — prikazati samo 3 ključna podatka koji korisniku odmah govore: **što je**, **kako stoji**, **koliko zarađuje/troši**.

## Što se mijenja na kartici

### Trenutno (previše info)
- Ikona + naziv
- Progress bar budžeta
- "% iskorišteno" tekst
- Boja projekta na lijevom rubu

### Novo (3 ključna elementa)

**1. Identitet**
- Ikona projekta + naziv
- Lijevi rub u boji projekta (ostaje)

**2. Mini semafor 🚦** (gornji desni kut kartice)
- 3 male točkice (~5px) složene vertikalno kao pravi semafor
- Samo jedna svijetli (puna boja + lagani glow), ostale dvije blijede (opacity 0.2)
- **🟢 Zelena (gore)** = projekt zdrav (profit pozitivan ILI <70% budžeta iskorišteno)
- **🟡 Žuta (sredina)** = pažnja (profit blizu nule ILI 70–95% budžeta)
- **🔴 Crvena (dolje)** = problem (gubitak ILI preko budžeta)
- **Zašto semafor a ne jedna točka**: univerzalna UX konvencija, color-blind friendly (pozicija nosi značenje), korisnik odmah prepoznaje da je status indikator

**3. Jedan ključni broj** (kontekstualno odabran)
- Ako projekt ima **prihode** → prikazuje **Profit/Gubitak** (npr. `+1.250 €` zeleno, `−340 €` crveno)
- Ako projekt ima samo **budžet i troškove** → prikazuje **Preostalo** (npr. `2.150 € preostalo`)
- Ako je **preko budžeta** → `−450 € preko` crveno
- Ako nema ni budžet ni prihode → broj transakcija (npr. `12 stavki`)
- Ispod broja mala oznaka što broj znači (`Profit` / `Preostalo` / `Preko budžeta` / `Stavke`)

## Vizualni prikaz

```
┌─────────────────────────┐
│ 🏗️ Renovacija      ●    │  ← zelena svijetli
│                    ○    │
│                    ○    │
│                         │
│ +1.250 €                │  ← veliki broj, boja po značenju
│ Profit                  │  ← mala oznaka
└─────────────────────────┘
   ↑ lijevi rub u boji projekta
```

## Tehnička implementacija

### Datoteka: `src/components/home/ActiveProjectsStrip.tsx`
- Refactor `useMemo` kalkulacije — uz `spent` dodati i `income`, `remaining`, `profit`, `healthLevel` ('green'|'yellow'|'red')
- Koristim postojeće `calculateProjectSpent` i `calculateProjectIncomeFromTransactions` iz `src/lib/projectCalculations.ts` — **bez novih funkcija**
- Sve se računa iz već dohvaćenih `allExpenses` props — **zero novih DB queries**
- Logika za `healthLevel`:
  - Ako ima prihode: zelena ako profit ≥ 0, crvena ako profit < 0, žuta ako profit između −5% i +5% prihoda
  - Ako ima samo budžet: zelena <70%, žuta 70–95%, crvena >95%
  - Ako nema ni jedno: zelena (neutralno)
- Logika za "ključni broj" (prikaz):
  - `hasIncome` → prikaži profit
  - `!hasIncome && hasBudget && spent > budget` → prikaži "preko"
  - `!hasIncome && hasBudget` → prikaži preostalo
  - inače → broj transakcija

### Nova mini-komponenta (inline u istoj datoteci)
- `<TrafficLight level="green" | "yellow" | "red" />` — 3 točkice, jedna aktivna
- ~16x6px, pozicionirana apsolutno u gornjem desnom kutu kartice

### i18n ključevi (dodaju se u `src/i18n/locales/hr.json`, `en.json`, `de.json`)
- `nav.profit` → "Profit" / "Profit" / "Gewinn"
- `nav.loss` → "Gubitak" / "Loss" / "Verlust"
- `nav.remaining` → "Preostalo" / "Remaining" / "Verbleibend"
- `nav.overBudget` → "Preko budžeta" / "Over budget" / "Über Budget"
- `nav.items` → "{{count}} stavki" / "{{count}} items" / "{{count}} Einträge"

## Što ostaje netaknuto
- ✅ Empty state ("Kreiraj prvi projekt")
- ✅ "+ Novi projekt" CTA kartica na kraju strip-a
- ✅ Skrivanje u Simple/Local/Business modu
- ✅ Naslov sekcije + "Pogledaj sve" link
- ✅ Loading skeleton
- ✅ Horizontalni scroll s snap-om
- ✅ Sva postojeća logika izračuna (samo se proširuje, ne mijenja)

## Sigurnosne provjere
- Bez DB promjena, bez novih queries, bez novih dependency-ja
- Bez utjecaja na `ProjectsPanel`, `ProjectFullScreenView`, `BusinessProjects` — mijenja se samo Home strip
- Bez utjecaja na color-coding transakcija (Faza 3) — koristi isti `project.color`

## Datoteke koje se mijenjaju
1. `src/components/home/ActiveProjectsStrip.tsx` — refactor prikaza
2. `src/i18n/locales/hr.json` — novi ključevi
3. `src/i18n/locales/en.json` — novi ključevi
4. `src/i18n/locales/de.json` — novi ključevi
