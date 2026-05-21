---
name: Dashboard V2 + Telemetry
description: Operativni "command center" redizajn dashboarda iza feature flaga + telemetrija sekcija (view/click/scroll) za 2-tjednu validaciju
type: feature
---

## Dashboard V2 raspored
- Feature flag `dashboardV2Enabled` u `AppStateContext` (default true, localStorage). Toggle "Klasični prikaz" u `NotificationsSection`.
- `PersonalModeView` V2 grana: Hero = `ActiveProjectsStrip` iznad izvora plaćanja (ako `!projectsHidden`). `SummarySection` u `compact` modu (samo Prihodi/Rashodi). Bez `CashflowForecast`, bez `QuickLinksSection`, bez `SavingsGoalsSection`.
- `Wallet.tsx` V2 dodaje: `SavingsGoalsSection` + `CashflowForecast` ispod izvora (logički raspored).
- `SummarySection` ima `compact?: boolean` prop koji skriva Available + Net Worth + Transfers/Recurring redove.

## Telemetrija (`dashboard_telemetry` tablica)
- Kolone: `user_id`, `session_id`, `event_type` (section_view|section_click|scroll_depth), `section`, `value`, `platform`, `metadata`, `occurred_at`.
- RLS: user vidi samo svoje, admin vidi sve, insert dopušten samom korisniku.
- Helper: `src/lib/dashboardTelemetry.ts` — batched insert (2.5s flush + pagehide), per-session dedup u `sessionStorage` (view + scroll thresholds).
- `TrackSection` wrapper (`src/components/dashboard/TrackSection.tsx`) koristi IntersectionObserver ≥0.5 za view event, `onClickCapture` za click. Sekcije s trackingom: `projects_hero`, `projects_strip`, `payment_sources`, `summary`, `ai_insights`, `transactions`.
- `useDashboardScrollDepth(enabled)` hook mountan u PersonalModeView (samo V2) — fire jednom po pragu 25/50/75/100.

## Admin pregled
- RPC `get_dashboard_section_stats(p_days)` i `get_dashboard_scroll_distribution(p_days)` — SECURITY DEFINER s `has_role(admin)` guardom. Vraćaju views/clicks/unique_users po sekciji i scroll distribuciju.
- Widget `PulseDashboardSections` u `PulseTab` ispod `PulseFunnelEvents` — bar chart sekcija + 4-stupčana scroll distribucija. Range 3/7/14/30 dana.

## Što NIJE napravljeno
- AI Insights operativizacija (još uvijek kategorijske anomalije, ne projektne).
- Hero polish (ActiveProjectsStrip ostao identičan).
- Bez DB migracije za sam V2 redizajn.
