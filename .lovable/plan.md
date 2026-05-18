## Cilj
Produžiti trial period s 14 na 30 dana. Postojeći korisnici automatski dobiju produženje (trial se računa iz `auth.users.created_at`, nema DB kolone).

## Pronađene reference

**Kod:**
- `src/lib/subscriptionTiers.ts` — `TRIAL_DURATION_DAYS = 14` (jedini izvor istine, koristi se u `isTrialExpired` i `getTrialDaysRemaining`; sve frontend logike (`SubscriptionContext`, `TrialBanner`, `useFeatureAccess`, guards) idu kroz tu konstantu — bez dodatnih izmjena)

**i18n (`hr`, `en`, `de`):**
- `auth.trialExpiredTitle` — "14-dnevni / 14-day / 14-tägige"
- `termsOfService.s3.p2` — opis trial perioda (HR trenutno netočno kaže "7-dnevni", EN/DE "14-day")

**Edge function:**
- `supabase/functions/trial-reminder/index.ts` — cron koji sad gađa "5. dan" (= 2 dana preostalo na 7-dnevnom trialu, komentar u kodu kaže "Trial is 7 days" što je zastarjelo). Treba ga uskladiti s novim 30-dnevnim trialom: slati podsjetnik na dan 28 (2 dana preostalo). Subject i HTML email sadrže hardkodirano "2 dana" što ostaje točno.

**Bez izmjena (nepovezano — EU zakonska obveza refunda 14 dana):**
- `privacyPolicy` / `termsOfService` refund tekstovi
- `auto-invoice-reminders` (3/7/14 dana kašnjenja fakture)

## Migracija postojećih korisnika
Nije potrebna DB migracija. Trial se izračunava on-the-fly iz `auth.users.created_at + TRIAL_DURATION_DAYS`. Promjena konstante automatski:
- produžuje sve aktivne trialove za +16 dana
- vraća na trial korisnike kojima je istekao u zadnjih 16 dana (osim ako su već konvertirani na plaćeni plan — `useFeatureAccess` i guards prvo provjeravaju `subscribed`/`tier`)

## Izmjene

1. **`src/lib/subscriptionTiers.ts`** — `TRIAL_DURATION_DAYS = 30`
2. **`src/i18n/locales/hr.json`** — `trialExpiredTitle` → "30-dnevni", `s3.p2` → "30-dnevni"
3. **`src/i18n/locales/en.json`** — `trialExpiredTitle` → "30-day", `s3.p2` → "30-day"
4. **`src/i18n/locales/de.json`** — `trialExpiredTitle` → "30-tägige", `s3.p2` → "30-tägige"
5. **`supabase/functions/trial-reminder/index.ts`** — promijeniti prozor s "5 dana nakon kreiranja" na "28 dana nakon kreiranja" + ažurirati zastarjeli komentar
6. **`src/test/subscriptionTiers.test.ts`** — test "isTrialExpired returns true for old date" trenutno koristi 30 dana; promijeniti na npr. 45 dana da ostane validan

## Napomena
Postoji cron job koji poziva `trial-reminder` (vjerojatno svakodnevno). Ne treba ga mijenjati — funkcija interno odlučuje koje korisnike obavještava.

Za korisnike koji su trenutno na dan 6-27 trial-a u trenutku deploya, podsjetnik im neće biti poslan (preskočili su dan 28). To je jednokratan side-effect i smatram ga prihvatljivim; alternativa je jednokratno ručno pokrenuti reminder za "stare" trialove — javi ako želiš da to dodam.
