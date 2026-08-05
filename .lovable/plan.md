# Nalaz: otvara li `tier` vrata mimo prava

Provjera bez izmjena. Kratki odgovor: **da, otvara — i to točno za Vinku i Petra.**

## 1. Tko čita `tier` iz odgovora

Odgovor `check-subscription` ulazi u jedan jedini potrošač:

- `src/contexts/SubscriptionContext.tsx:109-112` — `setSubscribed(data.subscribed)`, `setTier(data.tier)`, `setSource(data.source)`, uz `setEntitlements(data.entitlements)`.

Odatle `tier` ide dalje:

- `src/hooks/useFeatureAccess.ts:64` — čita `tier`, `trialActive`, `entitlementsMode`.
- `src/hooks/useFeatureAccess.ts:67` — `effectiveTier = trialActive ? 'business' : tier`.
- `src/hooks/useFeatureAccess.ts:80-87` — `hasTierAccess()`: rang `free < pro < business` protiv tablice `FEATURE_TIERS` (redci 29-48), u kojoj `business_module: 'pro'`.
- `src/hooks/useFeatureAccess.ts:89-98` — `hasAccess()`: u modu **`dual`** vraća `hasEntitlement(feature) || hasTierAccess(feature)`. **To je ILI — legacy tier je dovoljan sam za sebe.**

A `hasAccess` je gate za vidljivost i za pisanje:

- `src/hooks/useModuleStates.ts:21, 25, 29` — `tierUnlocked: hasAccess('krug' | 'projects' | 'business_module')`; `src/lib/moduleVisibility.ts:31, 54` iz toga računa `visible` / `locked` za BottomNav, Home pločice i `src/components/settings/ModulesSection.tsx:133, 260`.
- `src/hooks/useWriteGuard.ts:36, 43-47` — klijentski write gate za `kind: 'module'` također ide kroz `hasAccess`, ne kroz `hasModuleAccess`.
- `src/components/CSVImportDialog.tsx:59`, `src/components/FinancialAssistantDialog.tsx:77`, `src/components/WelcomeChecklist.tsx:36`.

Trenutna vrijednost `app_settings.entitlements_mode` je **`dual`**.

## 2. Ide li sve kroz `useModuleGate`

Ne. Postoje dva paralelna puta i oni se ne slažu:

- **Strogi put** — `useFeatureAccess.hasModuleAccess()` (redci 69-75): samo `entitlements[module].active` + `admin_module_grants`. Koriste ga `useModuleGate` (`src/hooks/useModuleGate.tsx:55`) i cijeli server sloj (`can_write_module` → `has_entitlement`, provjereno u živoj bazi — ne dira `user_subscriptions`).
- **Popustljivi put** — `hasAccess()` s legacy tier fallbackom, koji koriste vidljivost modula i `useWriteGuard`.

Dakle `tier` **nije** samo prikazni podatak.

## 3. Vinka i Petar konkretno

Iz baze (`user_subscriptions` s `tier <> 'free'`, 4 retka):

| user_id | `user_subscriptions.tier` | aktivni entitlementi |
|---|---|---|
| `fae4b087…` | `business`, `expires_at` NULL | trial (smjer/krug/projekti, istekao 21.2.), `business_legacy:migration` |
| `3213303b…` | `business`, `expires_at` NULL | trial (istekao 3.3.), `business_legacy:migration` |
| `d4d31ee6…` (vlasnik) | `business` | izravni `admin_grant` na sva 4 modula, uklj. `biznis` |
| `502cff5f…` (Akrobat) | `business` | `admin_grant` + `admin_module_grants: business` |

`has_entitlement` (živa definicija) od 4.8.2026. više ne mapira `business_legacy → biznis`, pa prva dva korisnika **nemaju** pravo na biznis. Ali:

1. `check-subscription/index.ts:115-126` — admin grana se izvršava **prije** Paddle grane i vraća `tier: 'business'` jer `expires_at` je NULL.
2. `effectiveTier = 'business'` → `hasTierAccess('business_module')` true → u `dual` modu `hasAccess` true.
3. `useModuleStates` javlja `tierUnlocked: true` → **biznis modul im je danas vidljiv i klijentski otključan.**

Server ih i dalje zaustavlja (`can_write_module` = false), pa ishod nije tiha privilegija nego **loš UX: modul se otvori, a spremanje padne na RLS-u.**

## 4. Najmanji zahvat koji to zatvara

**Prebaciti `app_settings.entitlements_mode` iz `dual` u `entitlements`.** Jedan redak podataka, bez ijedne izmjene koda.

Time `hasAccess()` (`useFeatureAccess.ts:95`) prestaje gledati legacy tier i postaje identičan strogom putu i serverskoj `can_write_module`. Kill-switch natrag na `dual` ostaje dostupan u sekundi.

Što se time **ne** dira:
- `admin_module_grants` i admin override — `has_entitlement` ih čita izravno, mehanizam ostaje netaknut i dalje radi za vlasnika i Akrobat.
- `user_subscriptions` i `setUserTier` u adminu — ostaju, ali prestaju biti prečac do modula.
- Trial — trial korisnici imaju prave `user_entitlements` retke (`source='trial'`), pa zadržavaju smjer/krug/projekti. Gubi se samo `trialActive → effectiveTier='business'` prečac, koji je i sam otključavao biznis bez prava.

Posljedica za Vinku i Petra: zadržavaju smjer, krug i projekti (preko `business_legacy`), a biznis im nestaje iz sučelja umjesto da se otvara pa puca.

Dodatna, neobavezna čistoća (može i poslije launcha): u `check-subscription` prijaviti `tier` izveden iz entitlementa umjesto iz `user_subscriptions`, da odgovor prestane sam sebi proturječiti. Nije nužno kad je mod `entitlements`, jer `tier` tada nigdje ne otvara vrata.

## Preporučeni redoslijed

1. Promjena `entitlements_mode` na `entitlements`.
2. Provjera u sučelju za jednog od dva pogođena korisnika.
3. Pun paket testova.
