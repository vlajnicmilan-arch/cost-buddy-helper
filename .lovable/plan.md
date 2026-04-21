

## Opcija B — Popravak Kanban prikaza + "Plan revidiran" indikator

### Što ćemo napraviti

**1. Kanban — pokazati badge revizija svim članovima**
- `MilestoneKanban.tsx` trenutno skriva `MilestoneRevisionTrendBadge` od običnih članova (Test ga ne vidi na ploči, samo u Listi)
- Uklanjamo `isManager` gating oko badge-a
- Edit/delete gumbi i drag & drop ostaju samo za managera (bez promjene)

**2. "Plan revidiran" — uvijek vidljiv badge kad postoje revizije**
- Trenutno: ako faza ima reviziju ali 0 € potrošnje, badge 📜 se prikazuje neutralno (sivo) — što je već u redu
- Provjera: osigurati da uvjet `revisionCount === 0 && !glowLevel` u `MilestoneRevisionTrendBadge.tsx` ne sakrije badge kad revizija **postoji** (trenutni kod to već ispravno radi, ali potvrdit ću renderiranje na 0% iskorištenosti)
- Dodati jasniji **tooltip** koji razlikuje dva slučaja:
  - "Plan revidiran X puta" → kad postoje revizije ali nema premašaja
  - "Faza je premašila budžet za Y €" → kad je usagePct ≥ 100
  - "Faza je blizu limita budžeta (Z%)" → kad je usagePct ≥ 80

### Datoteke koje se mijenjaju

| Datoteka | Promjena |
|---|---|
| `src/components/projects/MilestoneKanban.tsx` | Ukloniti `isManager &&` ispred `<MilestoneRevisionTrendBadge>` |
| `src/components/projects/MilestoneRevisionTrendBadge.tsx` | Dinamički tooltip prema stanju (revizija vs blizu limita vs premašaj) |
| `src/i18n/locales/{hr,en,de}.json` | 2 nova ključa: `projects.revisions.planRevisedTooltip`, `projects.revisions.glowNearWithPct` |

### Što se NE mijenja
- Baza, RLS politike, hook-ovi
- Permissions sustav (Test ostaje "member")
- List view (već radi nakon prošle izmjene)
- Logika izračuna iskorištenosti (spent/budget)

### Očekivani ishod
Test otvori projekt **Duje Grčić** i vidi na **kartici "Postavljanje parketa"** (i u Listi i na Kanban ploči):
- 📜 **1** — sivi badge s brojem revizija
- Hover/klik na badge → tooltip "Plan revidiran 1 put" → klik otvara povijest revizija
- Bez glow-a (jer je 0 € potrošeno od 800 €, što je ispravno ponašanje)

Kad netko unese trošak ≥ 640 € (80 %) → automatski se pojavljuje žuti glow.
Kad netko unese trošak ≥ 800 € (100 %) → crveni pulsirajući glow.

