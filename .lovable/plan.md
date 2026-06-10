## Cilj
Sastaviti jedan strukturirani DOCX dokument koji sadrži:
1. Trenutno stanje aplikacije V&M Balance (faktualno, na temelju koda + memorije).
2. Ocjenu i kritički osvrt po oblastima od strane "tima stručnjaka".
3. Konkretne prijedloge poboljšanja po oblasti.
4. Viziju — čemu težimo (srednji/dugi rok).

## Tim stručnjaka (7 uloga, paralelni subagenti)

Svaki dobiva isti pristup repou (read-only) i vraća strukturirani izvještaj: **Stanje · Ocjena (1–10) · Top 3 problema · Top 3 prijedloga**.

1. **Product / UX strateg** — onboarding, aktivacijski lijevak, navigacija, Projects/Wallet/Budget tokovi, mobile UX (384px), feedback (StatusFeedback), feature gating.
2. **Frontend arhitekt** — React 18 + Vite, struktura `src/components`, context providers, TanStack Query usage, lazy loading, veličina komponenti (pravilo ~300 linija), i18n (`t()`) pokrivenost.
3. **Backend / Data arhitekt** — Supabase shema, RLS policies, RBAC (`user_roles`), edge funkcije (FCM v1, digesti, invitations), trigger/RPC sloj, soft delete, migracije.
4. **Security & Compliance auditor** — RLS coverage, grants, security definer funkcije, secrets, GDPR account deletion, OAuth (Native), Stripe webhooks, RestrictIVE policies (module-access v2).
5. **Mobile / Native inženjer** — Capacitor (Camera/Haptics/StatusBar/Browser), bundle ID, version-bump pravilo, native OAuth flow, push notifications (FCM v1), offline queue, performance na low-end Android.
6. **QA / Reliability** — pokrivenost vitest, E2E Playwright suite, CI workflows (test + e2e + android-build), crash alerts, error localization, dialog lifecycle guard, graceful errors.
7. **Business / Monetizacija** — subscription tiers (Free/Pro/Business), Stripe integracija, EU SaaS odluka, AI quota, project type presets, retention/cohort dashboard, acquisition funnel.

Svaki subagent radi read-only pretragu: čita `mem://index.md` + relevantne memory fileove + uzorak ključnih izvornih datoteka iz svoje oblasti. Ne piše kod.

## Output dokument

Format: `.docx`, hrvatski, generiran preko docx-js skill-a, pohranjen u `/mnt/documents/vm-balance-audit-{datum}.docx`.

Struktura:

```
Naslovna
Sadržaj
1. Sažetak (executive summary) — 1 stranica
2. Trenutno stanje aplikacije
   2.1 Tehnologija i arhitektura
   2.2 Ključni moduli (Projects, Wallet, Budgets, Krug, Family, Business)
   2.3 Status stabilizacije (iz mem://features/projects-stabilization-status i sl.)
3. Ekspertski osvrti (7 sekcija, jedna po stručnjaku)
   - Stanje
   - Ocjena
   - Kritički osvrt
   - Prijedlozi poboljšanja
4. Konsolidirana matrica prioriteta (P0/P1/P2)
5. Vizija — čemu težimo (3, 6, 12 mjeseci)
6. Prilog: izvori (lista memory dokumenata i ključnih datoteka)
```

Stil: teal (HSL 172 66% 40%) za naslove gdje je moguće, Inter/Arial font. Bez emojija. Tablice s ocjenama i prioritetima.

## Što NE radim
- Ne mijenjam kod ni postavke.
- Ne izmišljam metrike (retention %, MAU itd.) — ako nema podatka u kodu/memoriji, eksplicitno označiti "nemam podatak".
- Ne kopiram cijeli kod u dokument — samo file:line reference gdje je relevantno.

## Procjena dužine
20–30 stranica DOCX-a. Generacija ~5–10 minuta (paralelni subagenti + docx-js + QA pregled stranica).

## Verifikacija prije isporuke
Konvertirati DOCX → PDF → slike, vizualno provjeriti svaku stranicu (clipping, prelijevanje tablica, prazne stranice). Ispraviti i regenerirati ako treba.
