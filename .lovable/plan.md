# Nalaz: `app_settings.billing_enabled`

Provjera bez izmjena koda. Zaključak: **prekidač je mrtav — ne može stati na put naplati 28.8.**

## 1. Gdje se čita

Samo na jednom mjestu, i to isključivo u admin sučelju:

- `src/pages/Admin.tsx:107-111` — `loadBillingSettings()` čita ključ iz `app_settings`.
- `src/pages/Admin.tsx:117-118` — `toggleBilling()` upsert-a vrijednost.
- `src/pages/Admin.tsx:66` — lokalni `useState` `billingEnabled`.
- `src/pages/Admin.tsx:408` → `src/components/admin/AccessTab.tsx:13, 22, 74, 81, 86` — Switch i tekst statusa („Naplata je aktivna / isključena").

Nigdje drugdje: nema pojave u ostatku `src/`, nema u `supabase/functions/`, nema u migracijama osim jednog INSERT-a koji ga stvara (`supabase/migrations/20260320162949_...sql:25`).

Provjera u živoj bazi:
- nijedna PL/pgSQL funkcija u `public` ne spominje `billing_enabled` (0 pogodaka u `pg_proc.prosrc`);
- nijedna RLS politika ga ne spominje (0 pogodaka u `pg_policies.qual`/`with_check`).

Trenutna vrijednost: `false`, `updated_at = 2026-03-20` — nije dirana od dana kad je tablica stvorena.

## 2. Što bi se promijenilo na `true`

Ništa osim izgleda admin kartice: Switch bi bio uključen i tekst bi se promijenio u „✓ Naplata je aktivna — korisnici vide ograničenja prema razini." Nijedna provjera prava, nijedan gate, nijedan limit ne čita tu vrijednost. Poruka u UI-u je danas neistinita u oba položaja.

## 3. Utjecaj na Paddle tok

Nikakav. Paywall, checkout, `paddle-webhook`, `paddle-portal-url`, `check-subscription`, `has_entitlement`, `can_write_module` i free-tier limiti (`free_tier_usage_monthly`) rade isključivo nad `user_entitlements` i `app_settings.entitlements_mode` (`dual`). Paddle put nikada ne pročita `billing_enabled`.

## 4. Ostaci iz Stripe vremena

Mehanizam „novi korisnik mora platiti dok ga admin ne odobri" **više ne postoji** — nema tablice odobrenja, nema provjere pri registraciji, nema `is_approved` polja. Prekidač je ostao bez svoje druge polovice; ako ga netko upali, ništa se ne budi.

Živi ostatak iz istog razdoblja koji **jest** funkcionalan (i nije predmet ovog pitanja, ne diramo ga):
- tablica `user_subscriptions` (tier free/pro/business) — admin je postavlja u `Admin.tsx:setUserTier`, a `check-subscription` je čita kao admin fallback ispred Paddle grane. To znači da ručno postavljen tier i dalje daje pristup. To je namjerni admin override, ne Stripe rudiment.

## 5. Preporuka

**Ukloniti kao mrtav kod — ali poslije launcha.**

Razlog: rizik da ostane = nula (ništa ga ne čita), a jedina stvarna šteta je zavaravajuća admin kartica koja tvrdi da isključuje naplatu za sve korisnike. Prije 28.8. ne dirati — svaka izmjena admin stranice je nepotreban rizik za nulti dobitak.

Nakon launcha, jednim potezom: makni Switch iz `AccessTab.tsx`, `loadBillingSettings`/`toggleBilling`/`billingEnabled` iz `Admin.tsx`, i `DELETE FROM app_settings WHERE key = 'billing_enabled'`. Preostali ključevi (`entitlements_mode`, `anchor_engine_mode`, AI strop) su živi i ostaju.
