
# Pricing Redesign — Opcija B (Preporučeno)

## Tvoje odluke
- **Cijene**: Pro €7.99/mj, Business €14.99/mj
- **Lifetime**: Samo Pro, €129 jednokratno (limitirano na prvih 200 — "Founding Members")
- **Trial**: 7 → 14 dana
- **Yearly popust**: 25% (Pro €71.90/god = €5.99/mj, Business €134.90/god = €11.24/mj)
- **Postojeći pretplatnici**: Instant migracija

## Nova cjenovna struktura

| Plan | Mjesečno | Godišnje | Ušteda |
|------|----------|----------|--------|
| Free | €0 | — | — |
| **Pro** | €7.99 | €71.90 (€5.99/mj) | 25% |
| **Pro Lifetime** | — | €129 jednokratno | Nakon 18 mj se isplati |
| **Business** | €14.99 | €134.90 (€11.24/mj) | 25% |

## Implementacijski koraci

### 1. Stripe — kreiranje novih proizvoda i cijena
Kreiraj kroz Stripe MCP:
- **Pro Monthly** €7.99 (recurring/month)
- **Pro Yearly** €71.90 (recurring/year)
- **Pro Lifetime** €129 (one-time payment)
- **Business Monthly** €14.99 (recurring/month)
- **Business Yearly** €134.90 (recurring/year)

Stari `price_*` ID-evi ostaju u Stripeu (arhivirani) za history/refundove, ali svi novi checkouti idu na nove ID-eve.

### 2. Migracija postojećih pretplatnika (instant)
Edge function `migrate-existing-subscriptions` koja:
1. Pull-a sve `active` subscriptions sa starim price ID-evima
2. Pozove `stripe.subscriptions.update()` s novim price ID-em + `proration_behavior: 'create_prorations'`
3. Pošalje email kroz `send-transactional-email` na HR/EN/DE: "Tvoj plan je nadograđen — nove značajke + nova cijena od sljedećeg ciklusa"
4. Logira sve u novu tablicu `subscription_migration_log` (audit)

**Email mora ići 7 dana PRIJE prve naplate po novoj cijeni** (zakonska obveza EU consumer protection). Stripe automatski generira proration invoice.

### 3. Lifetime Pro — implementacija
- Nova tablica `lifetime_purchases` (user_id, stripe_payment_intent_id, purchased_at, founding_member_number)
- Edge function `create-lifetime-checkout` (mode: `payment`, ne `subscription`)
- Edge function `verify-lifetime` se poziva paralelno s `check-subscription`
- Counter na landing page: "Founding Member 47/200"
- Kad se postigne 200 → automatski sakrije Lifetime opciju
- `useFeatureAccess` mora vratiti `pro` access ako postoji lifetime zapis

### 4. Trial 7 → 14 dana
- `src/lib/subscriptionTiers.ts`: `TRIAL_DURATION_DAYS = 14`
- Postojeći trialovi: prošireni za +7 dana (jednokratni SQL update na `profiles` ili computed kroz `created_at + 14 days`)
- Update i18n stringova ("7 dana besplatno" → "14 dana besplatno")

### 5. Frontend update
- `src/lib/subscriptionTiers.ts` — novi price ID-evi + Lifetime
- `src/pages/Paywall.tsx` — 4 kartice (Free, Pro mjesečno/godišnje toggle, Pro Lifetime, Business)
- `src/components/UpgradePrompt.tsx` — nove cijene
- `src/i18n/locales/{hr,en,de}.json` — svi pricing stringovi
- `src/pages/landingTranslations.ts` — landing pricing sekcija
- Yearly toggle s "Save 25%" badgeom
- Lifetime kartica s "Founding Member" badgeom + counter

### 6. Stripe Tax integracija (sljedeći korak nakon ovog plana)
Tek nakon što ovo bude live → uključi Stripe Tax (`automatic_tax: { enabled: true }` u checkout sessionu). Cijene postaju "tax-exclusive" i Stripe automatski dodaje PDV po zemlji kupca. Display na landing page: "€7.99 + PDV gdje primjenjivo".

## Što NE radimo u ovom planu
- Stripe Tax integracija — odvojeni korak nakon launcha
- Geo-pricing (PPP popusti za CEE) — odvojeni korak
- Promo kuponi za launch — možeš ih dodati ručno u Stripeu po potrebi

## Rizici i mitigacija
- **Churn od migracije**: Email 7 dana ranije + jasna komunikacija novih značajki minimizira reakciju. Očekuj 3-5% churn.
- **Lifetime support obveza**: Ograničavanje na 200 osoba sprječava dugoročni teret. Nakon prvog prodaja možeš relaunch s "Wave 2" po višoj cijeni (€179).
- **PDV kompleksnost**: Trenutno cijene tax-inclusive za HR (25% PDV uračunat). Nakon Stripe Tax integracije prelaziš na tax-exclusive — to će izgledati kao poskupljenje za HR, ali kao ispravnu cijenu za EU. Komuniciraj transparentno.

## Tehnički detalji (za referencu)
- **Stripe API**: koristi MCP alate `create_stripe_product_and_price` (5x), `update_subscription` (za migraciju)
- **Nove tablice**: `lifetime_purchases`, `subscription_migration_log`
- **RLS**: lifetime_purchases — users vide samo svoje; admin vidi sve
- **`check-subscription` edge function**: dodati lookup u `lifetime_purchases` prije Stripe poziva
- **Memory update**: `mem://business/subscription-and-monetization-model` mora biti ažuriran s novim cijenama, Lifetime planom i 14d trialom

---

**Sljedeći korak nakon approvala**: Krećem s implementacijom redoslijedom 1→6. Procjena: jedna iteracija (~10 min) za sve osim emaila migracije koji ide odgodno (zakaže za +7 dana).
