## Problem

`WelcomeChecklist` (banner "Počnite s V&M Balance" → Dodaj izvor / Unesi prvu transakciju / Postavi budžet) prikazuje se na dashboardu (`PersonalModeView.tsx:208`) **svim korisnicima** dok god nisu odbacili banner ili ispunili sva 3 koraka. Logika ne uzima u obzir:

- pretplatu (Pro/Business korisnik ga ipak vidi)
- postojanje business profila
- vrijeme dok se podaci učitavaju (zato bljesne na sekundu-dvije pa nestane)

## Rješenje

U `WelcomeChecklist` dodati uvjete kada se uopće NE renderira:

1. **Plaćeni korisnici** — ako `useFeatureAccess().isProTier === true` (Pro ili Business, uključujući trial) → `return null`. Checklist je onboarding alat samo za nove free korisnike.
2. **Business korisnici** — ako korisnik ima barem jedan business profil (kroz `useBusinessProfiles` / `business_mode_enabled`) → `return null`. Tko ima firmu, sigurno više nije u "počni od nule" fazi.
3. **Sprečavanje bljeska** — dok je `useSubscription().loading === true` → `return null` (umjesto da se banner načas pojavi pa nestane kad podaci stignu).

Sve ostalo (postojeća dismiss logika, auto-dismiss kad su 3/3, dizajn) ostaje netaknuto — banner i dalje radi za novog free korisnika bez business profila.

## Tehničke izmjene

**Samo `src/components/WelcomeChecklist.tsx`:**

- Import `useFeatureAccess` iz `@/hooks/useFeatureAccess`
- Import `useSubscription` iz `@/contexts/SubscriptionContext` (za `loading`)
- Import `useBusinessProfiles` iz postojećeg hooka (provjerit ću točan naziv tijekom implementacije — vjerojatno `useBusinessProfiles` ili `useActiveBusinessProfile`)
- Na vrhu komponente, prije render logike:
  ```ts
  if (subLoading) return null;
  if (isProTier) return null;
  if (hasAnyBusinessProfile) return null;
  ```

**Što se NE mijenja:**
- `PersonalModeView.tsx` (samo prosljeđuje propse — guard ide u sam banner radi clean separacije)
- `useSubscription`, `useFeatureAccess`, business profile hookovi
- i18n stringovi, dizajn, dismiss/localStorage logika
- Bez DB migracija

## Otvoreno pitanje (riješit ću tijekom implementacije, ne treba odluka)

Točan naziv hooka za business profile detection — najvjerojatnije `useBusinessProfiles().profiles.length > 0` ili `useBusinessMode()`. Provjerit ću u kodu prije implementacije.
