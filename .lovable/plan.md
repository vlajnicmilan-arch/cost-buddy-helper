
# Naplatni lanac — Paddle + entitlements (nacrt za odobrenje)

Samo dizajn. Nema izmjena koda. Milan odobrava prije gradnje.

---

## 1. DB shema

### 1.1 `user_entitlements` (glavna tablica prava)

```
user_entitlements
------------------
id                uuid PK default gen_random_uuid()
user_id           uuid NOT NULL references auth.users(id) on delete cascade
module            text NOT NULL   -- enum-like: 'smjer' | 'krug' | 'projekti' | 'pro_legacy' | 'business_legacy'
source            text NOT NULL   -- 'paddle' | 'stripe_legacy' | 'lifetime' | 'trial' | 'admin_grant'
status            text NOT NULL   -- 'active' | 'cancelled' | 'expired' | 'past_due' | 'refunded'
period_start      timestamptz NOT NULL
period_end        timestamptz          -- NULL = neograničeno (lifetime, admin_grant bez isteka)
billing_cycle     text                 -- 'monthly' | 'yearly' | 'lifetime' | NULL (trial/admin)
provider          text                 -- 'paddle' | 'stripe' | NULL
provider_sub_id   text                 -- Paddle subscription_id / Stripe sub_xxx / lifetime session id
provider_price_id text                 -- za trag na koji cjenik se veže
metadata          jsonb DEFAULT '{}'   -- npr. { "bundle": "komplet" } za razlaz Kompleta
created_at        timestamptz DEFAULT now()
updated_at        timestamptz DEFAULT now()

UNIQUE (user_id, module, provider_sub_id)  -- webhook idempotencija po subskripciji
INDEX (user_id, module) WHERE status = 'active'
INDEX (provider_sub_id)
```

RLS:
- SELECT: `auth.uid() = user_id` (korisnik čita svoje).
- INSERT/UPDATE/DELETE: samo `service_role` (webhook + admin RPC-i).
- Zasebna admin polica preko `has_role('admin')` za super-user pregled.
- GRANT SELECT to authenticated; GRANT ALL to service_role.

### 1.2 Komplet — jedan redak s eksplozijom kroz view (preporuka)

**Preporuka: 3 retka, `metadata->>'bundle' = 'komplet'`.** Razlog:
- Otkaz Kompleta = jedan Paddle event → 3 UPDATE-a u jednoj transakciji (istina, ali čisto: svaki modul ima nezavisan `status`).
- Upgrade Krug → Komplet: samo dodaš smjer + projekti, ne diraš krug (period se produžuje pri renewalu).
- Nema view kompleksije, nema JOIN-a u `has_entitlement()`.
- Downside: 3× više redaka. Prihvatljivo (max nekoliko po korisniku).

Alternativa (1 red + view) odbačena: `has_entitlement` bi morao znati bundle → modul mapping u SQL-u; RLS polica postaje kompliciranija.

### 1.3 Godišnje pretplate

`billing_cycle='yearly'`, `period_start` = zadnja naplata, `period_end` = +1 godina. Paddle `subscription.updated` pri renewalu produžava `period_end`. Grace period 3 dana za `past_due` prije prebacivanja u `expired`.

### 1.4 Legacy koegzistencija

Legacy Stripe (pro/business) i lifetime idu u istu tablicu:
- Stripe pro → red s `module='pro_legacy'`, `source='stripe_legacy'`, `provider_sub_id=sub_xxx`.
- Stripe business → `module='business_legacy'`.
- Lifetime → `module='pro_legacy'`, `source='lifetime'`, `period_end=NULL`, `billing_cycle='lifetime'`.

Feature-gate mapping (u aplikacijskom sloju, ne DB):
- `pro_legacy` daje: smjer + krug + projekti + business_module (kao danas Pro tier).
- `business_legacy` = `pro_legacy` + team_access + collaborators + advanced_projects.
- Novi Paddle korisnici dobivaju točno one module koje su platili.

Nema dualne naplate: `create-checkout` (Paddle) mora provjeriti postoji li aktivan `stripe_legacy` red i pokazati upozorenje.

### 1.5 Trial

Migracija: pri prvom loginu (ili već postojećim korisnicima jednokratnom migracijom) insert 3 retka:
```
(user_id, module='smjer', source='trial', period_start=user.created_at, period_end=+30d, status='active')
(user_id, module='krug',  source='trial', ...)
(user_id, module='projekti', source='trial', ...)
```
Cron `trial-reminder` (postoji) samo flipa `status='expired'` kad `period_end < now()`. Nema više klijentskog računanja iz `created_at`. `SubscriptionContext.trialActive` = `has_entitlement(uid, 'projekti')` sa `source='trial'`.

### 1.6 `webhook_events` (idempotencija)

```
webhook_events
--------------
id              uuid PK
provider        text NOT NULL      -- 'paddle' | 'stripe'
event_id        text NOT NULL      -- Paddle notification_id / Stripe evt_xxx
event_type      text NOT NULL
payload         jsonb NOT NULL
processed_at    timestamptz
processing_error text
received_at     timestamptz DEFAULT now()

UNIQUE (provider, event_id)
INDEX (received_at) WHERE processed_at IS NULL
```

Webhook prvo INSERT (ON CONFLICT DO NOTHING) → ako 0 redova, ignoriraj (već obrađeno). Inače obradi + UPDATE `processed_at`.

### 1.7 Migracija 6 testnih `user_subscriptions` zapisa

Prije launcha: DELETE tih 6 zapisa. Milan ručno reaktivira sebe/tester(a) preko `admin_module_grants` (već postoji) ili novog `user_entitlements` retka s `source='admin_grant'`. Ostavljanje starih zapisa dovodi do konflikta s novim webhookom.

`user_subscriptions` tablicu ne brišemo (za povijest / Stripe legacy pisanje), ali `check-subscription` prestaje biti glavni pisač — samo čita.

---

## 2. Paddle integracija

### 2.1 Ručno u Paddle dashboardu

Milan mora u sandbox + production kreirati:

| Product name | Prices (mjesečno / godišnje) | Vraća nam |
|---|---|---|
| Smjer | 5.99 EUR / mj, 59.90 EUR / god | price_smjer_month, price_smjer_year |
| Krug | 9.99 EUR / mj, 99.90 EUR / god | price_krug_month, price_krug_year |
| Projekti | 21.99 EUR / mj, 219.90 EUR / god | price_projekti_month, price_projekti_year |
| Komplet | 25.99 EUR / mj, 259.90 EUR / god | price_komplet_month, price_komplet_year |

Nam treba: 4 `product_id` + 8 `price_id` (sandbox + live = 24 vrijednosti). Sve u Supabase secrets kao `PADDLE_PRICE_SMJER_MONTH` itd.

Također: `PADDLE_API_KEY` (server), `PADDLE_CLIENT_TOKEN` (frontend), `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENV` = sandbox|production.

### 2.2 Checkout tok

**Paddle.js overlay** (preporuka, ne hosted):
- Ostajemo u aplikaciji (bolje mobile UX, Capacitor kompatibilno preko browser plugin-a).
- `Paddle.Checkout.open({ items: [{ priceId }], customer: { email }, customData: { user_id } })`.
- `user_id` u `customData` (Paddle passthrough). Webhook čita `data.custom_data.user_id`.
- Success callback → optimistički redirect na `/success`, ali istina dolazi tek preko webhooka (`subscription.created` upisuje entitlement).

Sigurnost user_id: `customData` je vidljiv klijentu, ali webhook potpis + `UNIQUE (provider, event_id)` sprječavaju spoofing (napadač ne može poslati validno potpisan Paddle webhook).

### 2.3 Webhook — koje evente

Endpoint: `supabase/functions/paddle-webhook`, `verify_jwt = false` u `config.toml`.

Verifikacija potpisa: header `Paddle-Signature` = `ts=…;h1=…`. Računamo `HMAC-SHA256(ts + ':' + raw_body, PADDLE_WEBHOOK_SECRET)`, uspoređujemo s `h1` konstantnim vremenom. Odbaci ako `|now - ts| > 5min`.

Eventi koje slušamo:

| Paddle event | Akcija |
|---|---|
| `subscription.created` | INSERT entitlement retka (ili 3 za Komplet), `status='active'` |
| `subscription.activated` | UPDATE `status='active'`, postavlja `period_end` |
| `subscription.updated` | UPDATE (plan change, next_billed_at) — produžava `period_end` na renewalu |
| `subscription.canceled` | UPDATE `status='cancelled'` (ali `period_end` ostaje — korisnik ima do isteka) |
| `subscription.paused` | UPDATE `status='past_due'` |
| `subscription.past_due` | UPDATE `status='past_due'` + grace 3 dana |
| `transaction.completed` | Za lifetime one-off (ako Milan uvede kroz Paddle) |
| `transaction.payment_failed` | Notifikacija korisniku, ne mijenja entitlement odmah |
| `adjustment.created` (refund) | UPDATE `status='refunded'`, `period_end=now()` |

Idempotencija: `webhook_events` INSERT prvi, obrada druga.

### 2.4 Customer portal

Paddle nema hosted customer portal kao Stripe. Umjesto toga:
- `PATCH /subscriptions/{id}` (API) za pauziranje, otkaz, promjenu plana → grade u našoj UI (`/settings/subscription`).
- Update payment method: Paddle daje `Paddle.Checkout.open({ transactionId })` s update flow-om.
- Prikaz sljedeće naplate, povijest transakcija: naš vlastiti UI koji povlači iz Paddle API-ja + `user_entitlements`.

Opseg: 1-2 dana rada za osnovni portal (view + cancel + resume).

### 2.5 Sandbox

- `PADDLE_ENV=sandbox` u dev. Sandbox = odvojen dashboard, odvojeni ID-evi.
- Test kartice Paddle daje (4242…). Webhook prema sandbox-u ide na dev Supabase projekt ili preko ngrok/localtunnel.
- Prije prebacivanja na live: E2E checklist (subscribe → renew simulacija preko API → cancel → refund) ručno.

---

## 3. Mapiranje prava → aplikacija

### 3.1 `has_entitlement(uid, module)` RPC

```
create function public.has_entitlement(_user_id uuid, _module text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_entitlements
    where user_id = _user_id
      and status = 'active'
      and (
        module = _module
        or (module = 'pro_legacy'      and _module in ('smjer','krug','projekti'))
        or (module = 'business_legacy' and _module in ('smjer','krug','projekti'))
      )
      and (period_end is null or period_end > now())
  )
$$;
```

Plus `has_entitlement_admin_grant(uid, module)` koji dodatno gleda `admin_module_grants` (već postoji).

### 3.2 Migracija RLS polica

Ne diramo postojeće police u istom PR-u. Redoslijed:
1. Kreiraj `user_entitlements` + RPC.
2. Populate iz postojećih izvora (Stripe → red per user, lifetime → red per user).
3. Postavi `has_entitlement` da čita novi + stari model (`OR` na `check-subscription` output) — feature flag `USE_ENTITLEMENTS` per user ili globalni.
4. Prebaci `is_projects_subscriber()` da poziva `has_entitlement(auth.uid(), 'projekti')`.
5. Nakon 1-2 tjedna stabilnog rada — ukloniti stari fallback.

### 3.3 Server-side brave za Krug i Biznis

Danas nema RLS gate-a. Dodati:
- `krug` tablice (krug, krug_membership itd.) — INSERT policy provjerava `has_entitlement(auth.uid(), 'krug')` OR `pro_legacy` OR admin_grant.
- Business tablice (business_profiles, invoices, quotes) — INSERT policy provjerava `has_entitlement(auth.uid(), 'projekti')` (jer je Biznis dio Projekti modula prema Milanovom modelu) ILI legacy business.

Napomena: to je najveći refactor police. Za sigurnost radi se u zasebnoj fazi (vidi 5.4).

### 3.4 `aiQuota.ts` — mapiranje ruta na module

| Ruta | Modul | Free | Plaćeno (isti modul) |
|---|---|---|---|
| `parse-receipt` | smjer | 10/dan | 200/dan |
| `parse-pdf-statement` | smjer | 3/dan | 50/dan |
| `financial-assistant` | smjer | 5/dan | 100/dan |
| `generate-ai-insights` | smjer | 2/dan | 20/dan |
| `scan-card` | smjer | 5/dan | 50/dan |
| `categorize-transaction` | smjer | 30/dan | 500/dan |
| `detect-loans` | smjer | 5/dan | 50/dan |
| `match-recurring` | smjer | 5/dan | 50/dan |
| `analyze-document` | projekti | 5/dan | 100/dan |
| `parse-standup` | projekti | 5/dan | 100/dan |

Logika: ako user ima aktivan `smjer` entitlement (bilo direkt, bilo Komplet, bilo pro_legacy) → smjer kvote. Inače free. Isto za projekti. Krug modul nema AI kvote (nema AI rute).

`resolveTier()` u `aiQuota.ts` postaje `resolveEntitlements(userId): Set<module>`.

Milan odobrava brojke.

---

## 4. Trial bug (danas)

Uzrok: `is_projects_subscriber()` gleda `user_subscriptions.tier in ('pro','business')` — trial nije zapisan tamo, klijent samo računa iz `created_at`.

Popravak u sklopu novog modela:
- Migracija: za svakog usera bez plaćene pretplate, insert 3 trial retka (smjer/krug/projekti) s `period_end = created_at + 30d`.
- `is_projects_subscriber()` → `has_entitlement(auth.uid(), 'projekti')` (koji ubraja trial automatski).
- Otpada klijentsko `isTrialExpired(created_at)` — postaje `has_entitlement(..., source='trial')` provjera.

Nakon migracije: trial korisnik klika "Novi projekt" → RLS prolazi jer `has_entitlement` vidi aktivan trial red.

---

## 5. Redoslijed gradnje (do 28.8.)

Fazi su nabrojane redom; unutar faze stavke mogu paralelno.

### Faza 1 — DB temelj (2-3 dana) — BLOKIRA sve ostalo
- 1a. Migracija: `user_entitlements`, `webhook_events`, indexi, RLS, GRANT.
- 1b. `has_entitlement()` RPC.
- 1c. Migracijski skript: populate iz `user_subscriptions` + `lifetime_purchases` + trial retci.
- 1d. DELETE 6 testnih `user_subscriptions` redaka.

### Faza 2 — Paddle setup (paralelno s 1) (1-2 dana Milanov posao + 1 dan naš)
- 2a. Milan: kreira products/prices u sandbox + production, dostavlja ID-eve.
- 2b. Secrets u Supabase: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN`, price ID-evi.
- 2c. Milan: setup Paddle webhook URL prema našoj (još nepostojećoj) edge funkciji.

### Faza 3 — Webhook (2-3 dana) — BLOKIRA checkout
- 3a. `paddle-webhook` edge fn s HMAC verifikacijom + `webhook_events` idempotencijom.
- 3b. Handleri za 8 event tipova (2.3).
- 3c. Sandbox E2E: subscribe → activate → cancel → refund; provjeri da se entitlementi ispravno mijenjaju.

### Faza 4 — Checkout + UI (3-4 dana) — može paralelno s 3 kad je 3a gotov
- 4a. `create-paddle-checkout` edge fn (opcionalno; ili direktan Paddle.js na klijentu).
- 4b. Nova pricing page s 4 kartice (Smjer / Krug / Projekti / Komplet) + mjesečno/godišnje toggle.
- 4c. Paddle.js integracija (dinamički import, Capacitor browser fallback).
- 4d. `/settings/subscription` — prikaz aktivnih entitlementa, cancel/resume gumbi (Paddle API pozivi).

### Faza 5 — Migracija gate logike (2-3 dana) — može paralelno s 4
- 5a. `useFeatureAccess` prebaci na `has_entitlement` (preko `SubscriptionContext` koji sad čita `user_entitlements`).
- 5b. `is_projects_subscriber()` → poziva `has_entitlement`. Popravlja trial bug.
- 5c. `aiQuota.ts` novo mapiranje.
- 5d. Popravak `SubscriptionContext.loading` (setLoading(false) u catchu).

### Faza 6 — Server-side gate Krug/Biznis (2-3 dana) — može poslije launcha ako fokus
- 6a. RLS police na krug_* tablicama.
- 6b. RLS police na business/invoice/quote tablicama.
- 6c. Regresijski SQL testovi.

### Faza 7 — Cutover (1 dan)
- 7a. Prebaci `PADDLE_ENV=production`.
- 7b. Objavi pricing.
- 7c. Monitor webhook_events, entitlement inserts prvih 48h.

**Ukupno: 12-18 dana rada.** Do 28.8. (danas 15.7. = ~6 tjedana) — realno **ako Milan brzo odradi Faze 2 (Paddle dashboard) i odgovori na blokade**.

**MORA raditi 28.8.:** Faze 1-5 + 7. **Može poslije:** Faza 6 (Krug/Biznis server-side gate — klijent gate je već dovoljan za launch, ali sigurnosni dug).

### Kritični rizici
- **Paddle account verification** može trajati (Paddle radi KYC nad tvrtkom). Milan treba pokrenuti verifikaciju SADA, ne u Fazi 2.
- **Domain approval** — Paddle traži verificirane domene za checkout. `vmbalance.com` mora biti approved.
- **Legacy Stripe korisnici** — ako u međuvremenu neko od 6 testnih zapisa preraste u pravu naplatu, treba jasno "freeze new Stripe subscribes" prije Faze 3.
- **6 testnih business zapisa** — obrisati ODMAH u Fazi 1d, inače riskiramo double-entitlement (Stripe legacy + Paddle novi).

---

## Otvorena pitanja za Milana

1. Cijene godišnjih pretplata — potvrda 10× mjesečno (59.90/99.90/219.90/259.90 EUR)?
2. Komplet mapiranje: potvrda "smjer + krug + projekti" (bez business_module posebno)?
3. Trial period nakon launcha: ostaje 30 dana za sve nove usere na svim modulima?
4. Downgrade politika: ako user otkaže Komplet i uzme samo Smjer — proration ili nova pretplata na kraj perioda?
5. Legacy Stripe: dozvoliti novim korisnicima BYO Stripe checkout, ili sakriti sve što nije Paddle?
