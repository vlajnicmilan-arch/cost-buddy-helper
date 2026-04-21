

## Opcija C — Notifikacije i proaktivna upozorenja

Nadograđujemo sustav iz pasivnog (korisnik mora otvoriti dialog) u **proaktivnog asistenta** koji sam upozorava na rizike.

---

### Što ćemo izgraditi

**1. In-app obavijest "Faza blizu limita" (80 % i 100 %)**
- Edge funkcija `check-milestone-budgets` (cron, 1×/dan u 8:00)
- Prolazi kroz sve aktivne faze i provjerava: `spent / planned_amount`
- Trigger pragovi:
  - **80 %** → "🟡 Faza X je na 85 % budžeta"
  - **100 %** → "🔴 Faza X je premašila budžet za 12 %"
- Šalje **push obavijest** + **in-app notifikaciju** (`notifications` tablica)
- Anti-spam: jedna obavijest po fazi po pragu (bilježi u `milestone_budget_alerts`)

**2. Auto-prijedlog povlačenja iz rezerve**
- Kad korisnik otvori `MilestoneBudgetChangeSection` za fazu koja je **iznad 100 %**
- Provjeri postoji li `is_contingency=true` faza s preostalim sredstvima
- Ako da → automatski preselektira opciju "Premjesti iz druge faze" + linked_milestone_id na rezervu
- Prikaže info bedž: "💡 Predlažemo povlačenje iz Rezerve (preostalo 800 €)"

**3. Vizualna upozorenja na karticama (bez novih notifikacija)**
- Kartica faze ≥80 % → žuti glow oko `MilestoneRevisionTrendBadge`
- Kartica faze ≥100 % → crveni glow + pulse animacija
- Ovo su trenutni vizualni signali, ne notifikacije — uvijek vidljivi

---

### Tehničke odluke

| Pitanje | Odluka | Razlog |
|---|---|---|
| Push ili samo in-app? | **Oboje** | Sustav već ima push infrastrukturu, kritične financijske informacije zaslužuju push |
| Cron ili real-time trigger? | **Cron 1×/dan** | Real-time = spam pri svakoj transakciji. Dnevno je dovoljno za budžet alerts |
| Anti-spam | **Nova tablica `milestone_budget_alerts`** | Bilježi `(milestone_id, threshold, sent_at)` da se isti prag ne šalje 2× |
| Tjedni sažetak | **Odgađamo za kasnije** | Dnevni alerti pokrivaju 90 % vrijednosti; sažetak je nice-to-have |

---

### Datoteke / promjene

**Baza (1 migracija):**
- Nova tablica `milestone_budget_alerts` (anti-spam log)
- RLS: korisnik vidi svoje, edge funkcija piše service role

**Backend (1 nova edge funkcija):**
- `supabase/functions/check-milestone-budgets/index.ts` — cron job
- Cron registracija (pg_cron, 8:00 svaki dan)

**Frontend:**
- `src/components/projects/MilestoneBudgetChangeSection.tsx` — dodati auto-prijedlog rezerve
- `src/components/projects/MilestoneKanban.tsx` — glow class na kartici
- `src/components/projects/ProjectMilestonesTab.tsx` — glow class na redu liste
- `src/components/projects/MilestoneRevisionTrendBadge.tsx` — primati `usagePct` prop za glow
- `src/i18n/locales/{hr,en,de}.json` — ~8 novih ključeva (notifikacije + glow tooltips)

**Bez izmjena:** `useNotifications`, `usePushNotifications` — postojeća infrastruktura već radi.

---

### Što ostaje za kasnije (ne radimo sada)

- ❌ Tjedni sažetak revizija (može doći s Opcijom D)
- ❌ Email obavijesti (već imamo push + in-app, dovoljno)
- ❌ Custom pragovi po projektu (sad fiksno 80/100, kasnije postavke)

---

**Reci "Idemo" za potvrdu, ili predloži izmjene.**

