---
name: Acquisition Funnel Events
description: Standardized 6-event funnel (install→signup→onboarding_complete→first_transaction→day7_active→paid_conversion) with admin dashboard
type: feature
---

# Acquisition Funnel

Tablica **`funnel_events`** (user_id nullable, session_id, event_name, platform, metadata jsonb, occurred_at). RLS: korisnici insert+select vlastite; admini select sve; anonimni dozvoljen samo `install` event.

**Dedup:** unique indexi
- `(user_id, event_name)` za signup/onboarding_complete/first_transaction/paid_conversion
- `(session_id, 'install')` za instalacije

**Helper:** `src/lib/funnelTracking.ts` — `logFunnelEvent(name, metadata)`. Best-effort, nikad ne baca, nikad ne blokira flow. Install se logira jednom po uređaju (localStorage flag `funnel_install_logged`). Sesija se generira jednom u `funnel_session_id`.

**Pozivi:**
- `install` — `src/main.tsx` u `idle()` callbacku, prije svega ostalog
- `signup` — `src/hooks/useAuth.ts` u `signUp()` (immediate session) + u `SIGNED_IN` listeneru (email-confirm flow fallback)
- `onboarding_complete` — `src/pages/Onboarding.tsx` nakon `setOnboardingCompleted(true)`
- `first_transaction` — `src/hooks/useExpenseCRUD.ts` nakon uspješnog inserta u `expenses`
- `day7_active` — `supabase/functions/activation-nudge/index.ts` (postojeći cron @ 10:00 UTC) — logira korisnike registrirane prije 7d koji su imali `user_login_logs` u zadnjih 24h
- `paid_conversion` — `supabase/functions/check-subscription/index.ts` na lifetime grani i Stripe active subscription grani

**Admin dashboard:** `PulseFunnelEvents.tsx` + `useFunnelEventsMetrics.ts` montiran u `PulseTab` iznad postojećeg `PulseActivationFunnel`. Prikazuje 6 koraka kao horizontalne barove s konverzijom od prethodnog koraka i od vrha. Range filter: 7/30/90 dana.

**Why:** Bez ovoga smo imali tri odvojena raštrkana sustava (`user_login_logs`, `activation_nudge_log`, `expenses`) koja samo djelomično pokrivaju funnel. Sad imamo jedinstveni event log s istim semantikama kao standardni acquisition funnel.
