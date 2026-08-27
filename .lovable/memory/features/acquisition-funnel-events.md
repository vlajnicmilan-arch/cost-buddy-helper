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

**UTM attribution:** `captureUtmParams()` se zove sinhrono u `main.tsx` na boot — čita `utm_source/medium/campaign/term/content` + referrer + landing_path iz URL-a i sprema u `localStorage.funnel_utm` (TTL 30 dana, first-touch — postojeći se ne prepisuje ako URL nema UTM). Svaki sljedeći `logFunnelEvent` automatski merge-a spremljene UTM-ove u `metadata`. Tako se signup/paid_conversion mogu atribuirati na izvor prometa bez vanjskog analyticsa.

**Pozivi:**
- `install` — `src/main.tsx` u `idle()` callbacku, prije svega ostalog
- `signup` — `src/hooks/useAuth.ts` u `signUp()` (immediate session) + u `SIGNED_IN` listeneru (email-confirm flow fallback)
- `onboarding_complete` — `src/pages/Onboarding.tsx` nakon `setOnboardingCompleted(true)`
- `first_transaction` — `src/hooks/useExpenseCRUD.ts` nakon uspješnog inserta u `expenses`
- `day7_active` — `supabase/functions/activation-nudge/index.ts` (postojeći cron @ 10:00 UTC) — logira korisnike registrirane prije 7d koji su imali `user_login_logs` u zadnjih 24h
- `paid_conversion` — `supabase/functions/paddle-webhook/index.ts` (Paddle Billing webhook): na `subscription.created`/`subscription.activated` sa statusom `active`, te na `subscription.updated` samo kad pretplata PRIJE događaja NIJE imala aktivno pravo (prijelaz u active, npr. trial→paid). Obnova već aktivne pretplate NE upisuje (reason `renewal_already_active`). Trial (`trialing`) i ručno dodijeljen pristup se ne bilježe. Upis je best-effort (nikad ne ruši webhook), 23505 se tretira kao uspjeh, dedup preko unique indeksa `(user_id, event_name)`. Logika u `_shared/paidConversion.ts` (`decidePaidConversion` + `recordPaidConversion`), testovi `src/test/paidConversion.test.ts`.

**Admin dashboard:** `PulseFunnelEvents.tsx` + `useFunnelEventsMetrics.ts` montiran u `PulseTab` iznad postojećeg `PulseActivationFunnel`. Prikazuje 6 koraka kao horizontalne barove s konverzijom od prethodnog koraka i od vrha. Range filter: 7/30/90 dana.

**Why:** Bez ovoga smo imali tri odvojena raštrkana sustava (`user_login_logs`, `activation_nudge_log`, `expenses`) koja samo djelomično pokrivaju funnel. Sad imamo jedinstveni event log s istim semantikama kao standardni acquisition funnel.
