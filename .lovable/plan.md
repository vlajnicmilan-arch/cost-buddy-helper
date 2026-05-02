## Cilj

Kartice u "Aktivni projekti" stripu na dashboardu trenutno znaju izgledati prazno (npr. Duje, Lucija i Mate) — semafor je tu, ali ispod njega ostaje vizualna rupa kad nema upozorenja. Dodati **kratku statusnu rečenicu** koja popunjava prostor i daje korisniku odmah kontekst u kojem je projekt.

## Princip

Tekst se generira **deterministički iz već dohvaćenih podataka projekta** (status, datumi, prihodi, troškovi, marža, txCount). To znači:

- **Bez AI/edge poziva** → bez latencije, bez troška, **uvijek točno** (poštuje pravilo "AI samo s točnim podacima").
- Tekstovi su **i18n ključevi** (HR/EN/DE), s placeholderima (npr. `{{days}}`, `{{pct}}`).
- **Crveno/žuto upozorenje ima prioritet** — kad postoji AI warning, ne dupliciramo statusnu rečenicu.

## Status hijerarhija (prvi koji se podudara, taj se prikaže)

Za svaku karticu:

1. **Crveno/žuto** (margin <30%) → već imamo `aiWarning` red — **ostaje, status se ne dodaje** (izbjegavamo dupli tekst).
2. **`status === 'paused'`** → `"Projekt je pauziran"`.
3. **`start_date` u budućnosti** → `"Projekt čeka početak — kreće {{date}}"` (ili `"za {{days}} dana"`).
4. **`end_date` prošao i nije completed** → `"Rok prošao — projekt još otvoren"`.
5. **`txCount === 0` i nema prihoda/troška** → `"Projekt je tek započeo — još nema unosa"`.
6. **Marža ≥ 30% i ima prihoda** → `"Projekt je stabilan — bravo!"` (motivacijski).
7. **Ima budgeta i remaining > 70% budgeta** (rano u potrošnji) → `"U pripremnoj fazi — iskorišteno {{pct}}% budžeta"`.
8. **Ima budgeta i remaining 30–70%** → `"U punom zamahu — iskorišteno {{pct}}% budžeta"`.
9. **Ima budgeta, remaining < 30% ali ≥ 0** → `"Pred kraj — preostalo {{pct}}% budžeta"`.
10. **Fallback** → `"Projekt je u tijeku · {{count}} unosa"`.

## Promjene u kodu

### 1. Novi helper `src/lib/projectStatusLine.ts`

Pure funkcija:
```ts
getProjectStatusLine(data: {
  status, start_date, end_date,
  income, spent, budget, margin, txCount, health
}, t): { text: string; tone: 'info' | 'success' | 'muted' } | null
```
Vraća `null` kada se ne treba prikazati (kada postoji AI warning) — tako kartica ostaje čista.

### 2. `src/components/home/ActiveProjectsStrip.tsx`

- U `activeProjects` mapiranju pozvati `getProjectStatusLine(...)` i pohraniti `statusLine` na `ProjectCardData`.
- Renderirati ispod centerpiece reda **samo ako nema AI warninga** (zelena kartica). Mali decentni red s ikonom (`Sparkles` za success, `Clock` za waiting/pause, `Info` za ostalo) i prigušenom bojom — ne natječe se sa semaforom.
- Ako AI warning ipak postoji → prikazuje se on (kao i sad), statusna rečenica se preskače.

### 3. i18n (`hr.json`, `en.json`, `de.json`)

Dodati pod `projects.statusLine`:
- `paused` — "Projekt je pauziran" / "Project is paused" / "Projekt pausiert"
- `waitingStart` — "Čeka početak · kreće {{date}}" / ekv.
- `waitingStartSoon` — "Kreće za {{days}} dana"
- `overdueOpen` — "Rok prošao — projekt još otvoren"
- `justStarted` — "Tek započeo — još nema unosa"
- `stable` — "Stabilan — bravo!"
- `prepPhase` — "Pripremna faza · {{pct}}% budžeta"
- `inFullSwing` — "U punom zamahu · {{pct}}% budžeta"
- `nearEnd` — "Pred kraj · preostalo {{pct}}%"
- `inProgress` — "U tijeku · {{count}} unosa"

### 4. Stil

Status red:
- `text-[11px] text-muted-foreground` u sivom tonu za info/muted.
- `text-income/80` za `success` (stabilno).
- Tanka 1-line truncate, ikona 12px lijevo.
- Visina ~18px → popunjava prostor bez da kartica "buja".

## Što se NE dira

- Health/margin logika i `aiWarning` ostaju netaknuti.
- Hookovi za podatke, ostali ekrani, projekti page — ništa se ne mijenja.
- Bez DB migracije, bez novih API poziva, bez novih dependency-ja.

## QA

- Projekt s prihodom i maržom 50% → "Stabilan — bravo!" (zeleno).
- Projekt s budgetom 5000 €, potrošeno 800 € → "Pripremna faza · 16% budžeta".
- Projekt sa `start_date` u budućnosti → "Kreće za N dana".
- Projekt s 0 unosa → "Tek započeo".
- Projekt s maržom 8% → AI warning crveni, status linija se NE prikazuje (bez dupliranja).
- HR/EN/DE prijevodi rade.
