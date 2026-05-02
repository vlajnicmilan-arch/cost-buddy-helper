---
name: Project activation funnel & Day 1/3/7 nudges
description: Onboarding hint, ActiveProjectsStrip on home, activation funnel admin metric, color-coded transactions per project, and Day 1/3/7 push nudges via cron edge function.
type: feature
---
# Project-centric redesign (3 faza)

## Faza 1 — UI prioritizacija
- BottomNav: Pregled → **Projekti** (2.) → Novčanik → Budžeti → (Obitelj). Kalendar uklonjen iz primarnog nava.
- `ActiveProjectsStrip` (src/components/home/) — horizontalni strip aktivnih projekata iznad `SummarySection` u `PersonalModeView`. Empty-state CTA "Kreiraj prvi projekt".
- Sakriva se: simple mode, local mode, business mode, bez Pro pristupa.
- **Kartica (v2)**: 200x170 px. Centerpiece je `BigTrafficLight` (3 horizontalna kruga 14px) + iznos profita + margin badge. Health po profitnoj marži: ≥30% zeleno, <30% žuto + AI warning, <10% crveno + AI alert. Žuti i crveni kružić emocionalno pulsiraju (CSS `traffic-pulse-warn` / `traffic-pulse-crit` u `index.css`). AI tekst je lokalni i18n (`projects.health.aiWarning.{yellow|red}` s `{{pct}}`), bez API poziva. Za projekte bez prihoda margin se računa iz `total_budget`; ako nema ni budgeta ni prihoda, fallback na txCount.

## Faza 2 — Aktivacija
- `useActivationFunnel` hook + `PulseActivationFunnel` u admin Pulse panelu (Registrirani → Ima projekt → Ima transakciju).
- `ProjectOnboardingHint` (src/components/projects/) — dismissible banner s 3 quick-start templatea (Renoviranje, Klijent, Osobni cilj). Pre-fills `ProjectDialog` preko nove `preset` prop.
- Dismissal perzistira u `localStorage` pod ključem `project_onboarding_hint_dismissed`.

## Faza 3 — Color-coding + Push nudges
- `TransactionItem`: 3px lijevi accent stripe + obojeni project badge koristeći `projectInfo.color` iz postojećeg `contextLookup.projects` (zero new queries).
- Tablica `activation_nudge_log` (UNIQUE user+day, admin-only RLS).
- Edge funkcija `activation-nudge`: za dane 1/3/7 nakon registracije, šalje push korisnicima koji još nemaju projekt; poštuje `notification_preferences.projects_enabled`; deep-link `data.route = "/projects"`.
- Cron `activation-nudge-daily` u 10:00 UTC, scheduled via pg_cron + pg_net.
- Tekstovi push obavijesti: HR/EN/DE u edge fn, default HR (locale nije na profilima).

**Why:** Projekti su primarna value prop V&M Balance. Phase 1+2+3 kombinirano podiže aktivacijsku stopu (% korisnika koji unese transakciju u projekt) bez utjecaja na bilo koji postojeći flow.
