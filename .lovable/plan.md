

## Što slijedi — sljedeći logični koraci

Završili smo **Razinu 1 + Razinu 2** plana za nepredviđene troškove. Evo 4 prirodna nastavka, poredana po vrijednosti:

---

### Opcija A — Vizualni indikatori i povijest na karticama faza ⭐ preporučeno
Dodati na svaku karticu faze (Kanban i lista):
- 📜 **Badge s brojem revizija** (npr. "3 promjene") → klik otvara `MilestoneRevisionsDialog`
- ↗ / ↘ **Trend strelica** ako je budžet mijenjan u zadnjih 30 dana (zelena = ušteda, crvena = premašaj)
- 🛡️ **Status rezerve** — koliko je preostalo od početne rezerve (npr. "Rezerva: 800 € / 1.000 €")

**Zašto prvo:** sustav već bilježi revizije, ali korisnik ih trenutno mora aktivno otvarati kroz dialog. Bez vizualnih signala ne zna da postoje. Ovo je "kompletiranje" prethodnog rada.

---

### Opcija B — Izvještaj o reviziju budžeta u Project Reports
Proširiti postojeći `ProjectReportsDialog` s novom sekcijom **"Promjene budžeta"**:
- Ukupan iznos premašaja po kategoriji (Premašaj/Ušteda/Promjena opsega/Korekcija)
- Top 3 faze s najviše promjena
- Iskorištenost rezerve (koliko od 10 % je potrošeno)
- Argument prema klijentu: "Od 12.000 € premašaja, 8.000 € otpada na promjene opsega"

**Zašto:** zatvara cijeli ciklus — od bilježenja do iskorištenja podataka. Direktna poslovna vrijednost.

---

### Opcija C — Notifikacije i upozorenja
- **Push/in-app obavijest** kad je faza prešla 80 % budžeta ("Faza X je na 85 % budžeta — razmisli o reviziji")
- **Auto-prijedlog povlačenja iz rezerve** kad faza pređe 100 % i postoji rezerva
- **Tjedni sažetak** revizija po projektu

**Zašto:** pretvara pasivni alat u proaktivnog asistenta. Najveća korisnost, ali najviše rada.

---

### Opcija D — Druga tema (npr. izvještaji, šihterica, AI asistent)
Pauziramo nepredviđene troškove i prelazimo na nešto drugo iz tvojeg backloga.

---

## Moja preporuka

Idi s **Opcijom A** sada — to je 30 min posla i zatvara prošlu rundu tako da korisnik **vidi** vrijednost onoga što smo upravo izgradili. Bez vizualnih indikatora cijela ta funkcionalnost je "skrivena" iza dialoga koji nitko neće otvoriti bez razloga.

Onda **Opcija B** kao sljedeći korak (poslovna vrijednost), a **Opcija C** kasnije kad sve sjedne.

---

## Implementacija Opcije A (ako odobriš)

**Datoteke:**
- `src/components/projects/MilestoneKanban.tsx` — dodati badge i trend strelicu na karticu
- `src/components/projects/ProjectMilestonesTab.tsx` — isto za list view
- `src/hooks/useMilestoneRevisions.ts` — dodati pomoćne metode `getRevisionCount(milestoneId)` i `getRecentTrend(milestoneId, days)`
- `src/components/projects/MilestoneRevisionTrendBadge.tsx` (nova) — reusable mali badge

**Logika rezerve:** za fazu s `is_contingency=true` prikazati postotak preostalog umjesto trenda (jer rezerva nije pravi trošak).

**Lokalizacija:** dodati ~6 novih ključeva u hr/en/de.

**Bez izmjena baze.** Sve se gradi na već postojećim podacima.

---

**Reci A, B, C, D ili predloži svoje.**

