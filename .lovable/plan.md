
# Faza 5 — Aplikacija čita `user_entitlements`

Cilj: `has_entitlement(user, module)` postaje jedini izvor istine za pristup, bez da itko izgubi pravo. Legacy `user_subscriptions` i `lifetime_purchases` ostaju živi kao fallback ulaz u `has_entitlement`, ne kao paralelni gate.

---

## 1) Inventar gateova (danas → poslije)

**Klijent — čita danas `SubscriptionContext` (`check-subscription` → Stripe/admin/lifetime → tier free/pro/business):**

| Mjesto | Danas | Poslije |
|---|---|---|
| `SubscriptionContext.tsx` | `check-subscription` vraća tier | vraća + `entitlements: {smjer,krug,projekti,biznis}` iz `has_entitlement`; `tier` ostaje derived (za UI kompatibilnost) |
| `useFeatureAccess.ts` | mapira feature→tier rank | mapira feature→**modul**, pita `entitlements[modul]` |
| `useFreeLimits.ts` | limiti kad `tier==='free'` | limiti kad **nijedan modul nije aktivan** (nema smjer/krug/projekti/biznis) |
| `useModuleStates.ts` | `tierUnlocked = hasAccess('krug'|'projects'|'business_module')` | isto, ali `hasAccess` interno ide na entitlements |
| `useProjectAccessLevel.ts` | `hasAccess('projects')` | `entitlements.projekti` |
| `BusinessModeGuard.tsx` | `subscribed||trialActive` | `entitlements.biznis` (source ≠ null ILI trial confirmed expired ostaje jednak) |
| `Paywall.tsx` gate u `App.tsx` | trial expired && !subscribed | nema aktivnog entitlementa **na modulu koji korisnik pokušava koristiti** — za Fazu 5 zadržavamo: paywall samo kad korisnik nema **nijedan** aktivni modul (isto kao free) |
| `TrialBanner`, `TrialFeatureChip`, `UpgradePrompt`, `SubscriptionSection`, `WelcomeChecklist`, `Admin.tsx` | čitaju `tier`/`trialActive` | čitaju iste polja iz konteksta (derived), bez izmjena logike |
| `subscriptionTiers.ts` | konstante, `isTrialExpired(created_at)` | konstante ostaju za UI/Stripe legacy; `isTrialExpired` **više ne odlučuje o pristupu** — samo prikaz preostalih dana iz `entitlements.trial.period_end` |

**Server:**

| Mjesto | Danas | Poslije |
|---|---|---|
| `check-subscription` edge fn | Stripe→tier, admin, lifetime | ostaje, ali **dodatno** vraća entitlements iz `has_entitlement` za svaki modul + period_end + source |
| `is_projects_subscriber(uid)` | `user_roles admin` ∪ `user_subscriptions pro/business` ∪ `lifetime_purchases` | zamijeniti tijelo s `has_entitlement(uid,'projekti')` (koji već pokriva legacy + admin_grant + paddle) |
| `_shared/aiQuota.ts` (edge) | tier iz `user_subscriptions` + lifetime, string match | `has_entitlement(uid,'smjer')` → pro kvota; inače free |
| RLS politike koje zovu `is_projects_subscriber` | rade preko helpera | ništa se ne mijenja jer helper ostaje isti potpis |
| `trial-reminder`, `backup-weekly` | čitaju `user_subscriptions` | ostavljamo **izvan Faze 5** (cron, ne blokira launch) |

---

## 2) Mapiranje funkcionalnost → modul (ZAHTIJEVA MILANOVU POTVRDU)

Prijedlog:

| Feature (useFeatureAccess) | Modul |
|---|---|
| `unlimited_transactions`, `unlimited_payment_sources`, `unlimited_budgets`, `csv_import`, `pdf_import`, `reports`, `ai_assistant`, `recurring_transactions`, `savings_goals`, `installments`, `custom_categories`, `sharing` | **smjer** |
| `krug` | **krug** |
| `projects`, `advanced_projects`, `workforce`, `collaborators`, `team_access` | **projekti** |
| `business_module` | **biznis** |

Napomene:
- `sharing` (obitelj/family) → **smjer** (dio osobnih financija). Alternativa: uz `krug`. Milan bira.
- `team_access`/`collaborators` su danas 'business' tier; mapiramo ih u **projekti** jer se koriste isključivo unutar projekta. Ako Milan želi da to bude ekskluziva Kompleta → mapirati u `biznis`.
- Feature→modul mapa živi u **jednom** file-u (`src/lib/featureModuleMap.ts`) — ne rasipati.

---

## 3) Trial

- Izvor: red u `user_entitlements` gdje `source='trial'`, po modulu, s `period_end`.
- Kod: `SubscriptionContext` više ne računa `isTrialExpired(user.created_at)`; umjesto toga za svaki modul: `trialActive[modul] = entitlement.source==='trial' && period_end > now()`. `trialDaysRemaining` = max preostalih dana preko svih trial entitlementa (za `TrialBanner`).
- Postojećih 33 trial redaka (11 usera × 3 modula, bez biznisa) je već upisano — pristup ostaje identičan.
- Kad trial istekne u Fazi 5 → korisnik pada na **Free** (postojeći `useFreeLimits`). Read-only politika je zasebna faza (Milanov mandat).
- Novi signupi: potreban je hook koji nakon `signup` inserta 3 trial retka (smjer/krug/projekti, +30 dana). To radi trigger `on_auth_user_created` — provjeriti postoji li; ako ne, dodati u Fazi 5.

---

## 4) Sigurnost prijelaza

**Odabir: dvostruko čitanje ~7 dana, s postavkom kill-switch.**

Rezoning: rez preko noći bi bio čist, ali svaka rupa u mapiranju znači da netko izgubi pristup — a to je gore od privremene tolerancije. `has_entitlement` već pokriva legacy Stripe (`pro_legacy`/`business_legacy`) i admin_grant, pa je "dvostruko čitanje" tehnički samo: klijent traži `hasAccess`, koji vraća `true` ako **entitlement postoji ILI** legacy fallback vraća true. U praksi: `has_entitlement` je taj koji radi OR — pa se u aplikaciji ne duplicira ništa. Prijelaz je jednostruk sa server-side safety-netom.

**Feature flag:** `VITE_ENTITLEMENTS_MODE` (`legacy` | `dual` | `entitlements`). Default `dual` u tjednu prijelaza; nakon 7 dana bez incidenta → `entitlements`. Rollback = flip flag na `legacy` bez deploya (postavlja se u `app_settings`, čita ga `SubscriptionContext`).

**Test matrix prije publisha (staging/preview):**

| Korisnik | Očekivano |
|---|---|
| vlajnic.milan (admin_grant, svi moduli) | pun pristup |
| hr.akrobat (admin_grant) | pun pristup |
| tactura.hr (paddle Komplet, 3 modula, biznis NEMA) | smjer+krug+projekti pun, biznis paywall |
| bilo tko iz 11 trial usera | pristup na 3 modula do isteka triala |
| istekli trial user (simulirati backdate period_end) | free limiti, paywall na Pro features |
| vinka.plesko, vlajnic.petar (legacy `user_subscriptions.tier='business'`, expires_at NULL) | pun pristup preko legacy grane u `has_entitlement` |
| tuđi worker/investitor na projektu | pristup preko project_members (RLS), ne dira entitlements |
| brand new signup | trial insertan, 3 modula aktivna |

Provjera se radi: (a) SQL — pozvati `has_entitlement` za svaki user × modul; (b) UI — login kao svaki od gornjih (preko admin impersonate ili test emailova) na preview URL; (c) grep test da nijedan `useFeatureAccess` poziv ne prolazi pored novog konteksta.

**Rollback:** flip `VITE_ENTITLEMENTS_MODE=legacy` u `app_settings` (bez deploya). `is_projects_subscriber` promjena je jedina koja mijenja tijelo funkcije — držimo staru definiciju u komentaru migracije da se u 30s vrati.

---

## 5) Serverska strana

Faza 5 dira **samo**:
1. `is_projects_subscriber` — tijelo delegira `has_entitlement(uid,'projekti')`. Ista signatura, iste RLS politike ostaju netaknute.
2. `check-subscription` — dodaje `entitlements` u response.
3. `_shared/aiQuota.ts` — čita `has_entitlement(uid,'smjer')` umjesto tiera.

Ostalo (`trial-reminder`, `backup-weekly`, `tablesToPurge`) → **Faza 6** (nije kritično za launch, cronovi ne blokiraju korisnika).

---

## 6) Redoslijed i opseg

```text
Korak 1 · featureModuleMap.ts + tipovi                   S   (nova mapa, bez logike)
Korak 2 · check-subscription vraća entitlements          M   (edge, 1 fn, aditivno)
Korak 3 · SubscriptionContext izlaže entitlements+trial  M   (kontekst, backward-compat: tier ostaje)
Korak 4 · useFeatureAccess prelazi na entitlements       M   (jedno mjesto)
Korak 5 · useFreeLimits: "free" = 0 aktivnih modula      S
Korak 6 · Paywall gate u App.tsx čita entitlements       S
Korak 7 · is_projects_subscriber → has_entitlement       S   (migracija, jedan CREATE OR REPLACE)
Korak 8 · aiQuota.ts → has_entitlement                   S
Korak 9 · Trigger za trial na signup (ako ne postoji)    S
Korak 10 · Test matrix (SQL + preview login)             M
Korak 11 · Kill-switch (app_settings.entitlements_mode)  S
Korak 12 · Publish s flagom 'dual', 7 dana monitor       -
```

Legend: S ≈ pola sata, M ≈ 1–2h. Ukupno ~1 radni dan bez testiranja, +pola dana test matrix.

**Ne diram u Fazi 5:**
- Read-only politika za istekli trial (poseban proizvodni razgovor).
- Migracija 4 legacy `user_subscriptions` retka u `user_entitlements` (nije potrebno — legacy grana u `has_entitlement` ih pokriva; može se raditi kasnije kao clean-up).
- `trial-reminder`, `backup-weekly`, `tablesToPurge`.

---

## Otvorena pitanja za Milana prije koda

1. Potvrdi feature→modul mapu (poglavlje 2), posebno `sharing` i `team_access/collaborators`.
2. Dvostruko čitanje 7 dana + kill-switch — OK, ili tvrdi rez?
3. Novi signup: koliko trial redaka i koji moduli (smjer/krug/projekti; biznis ne)?

Čekam odobrenje.
