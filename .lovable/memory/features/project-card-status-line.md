---
name: Project card status line on dashboard
description: Deterministic short factual sentence under the traffic light on Active Projects strip cards, fills empty space when no AI warning is shown.
type: feature
---
# Project card status line (dashboard)

`src/lib/projectStatusLine.ts` → pure `getProjectStatusLine(input, t)` returns `{ text, tone, icon } | null`.

## Hijerarhija (prvi match):
1. health !== 'green' → `null` (AI warning ima prioritet, izbjegava se dupli tekst).
2. status === 'paused' → `paused`
3. start_date u budućnosti → `waitingStartSoon` (≤14d) ili `waitingStart`
4. end_date prošao i status nije completed/cancelled → `overdueOpen` (warning tone)
5. txCount=0 i nema income/spent → `justStarted`
6. income > 0 i margin ≥ 30% → `stable` (success tone)
7. budget > 0: usedPct < 30 → `prepPhase`, < 70 → `inFullSwing`, ≥ 70 → `nearEnd`
8. fallback → `inProgress`

## Render
`ActiveProjectsStrip` zove helper u `useMemo`-u, sprema `statusLine` na `ProjectCardData`. Render ispod centerpiece reda, **uz** AI warning (warning ima prioritet jer se status linija već vraća null kad zelena nije).

Stil: `text-[11px]`, ikona 12px (`Sparkles`/`Clock`/`Pause`/`Info`/`AlertCircle`), tone classes:
- success → `text-income`
- warning → `text-warning`
- info → `text-foreground/70`
- muted → `text-muted-foreground`

## i18n
Ključevi pod `projects.statusLine.*` u sva 3 jezika (HR/EN/DE) — placeholderi `{{date}}`, `{{days}}`, `{{pct}}`, `{{count}}`.

**Why:** Bez ovoga su zelene kartice (npr. tek dodani projekti, projekti u pripremi) izgledale prazno ispod semafora. Sada uvijek imaju kratak, faktografski točan kontekst — bez AI poziva i bez troška.
