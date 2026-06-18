
# Acceptance-fix pass — guided / 0-data home

Fix samo runtime ponašanja koja odstupaju od zaključane arhitekture. Bez novog scopea.

## Što je stvarno krivo (potvrđeno iz koda)

1. **0-data nije izoliran** — `PersonalModeView.tsx` renderira `HomeHeader`, `WalletViewModeChips`, `TrialBanner`, `FinancialAssistantDialog`, `SharedDialogs`, `AIInsightBubble`, `BottomNav` i footer **izvan** `showGuidedLayout` ternarya. Gateira se samo srednji blok (Summary / ActiveProjects / Transactions / QuickLinks). Search bar i primarne akcije (Reports/Scan/Manual) sjede u `HomeHeader` → uvijek vidljivi.
2. **CTA "Zabilježi prvi trošak" otvara browse modal** — `ZeroDataQuietState` i `GuidedHomeView` zovu `props.onExpenseDialogChange(true)`. U `SharedDialogs.tsx` (linija 101–109) `expenseDialogOpen` montira `TransactionListDialog` tipa `expense` (popis troškova), ne add flow. Stvarni add entry je `useReceiptScan().openManualAdd(...)` (vidi `ManualAddTriggerButton.tsx`).
3. **Skip path izlazi iz guideda** — `onDismiss` u `ZeroDataQuietState` poziva `guided.exit('manual_dismiss')` što postavlja `guided_home_exited_at` i prebacuje korisnika u standard. User izričito traži da skip ostavlja korisnika u 0-data quiet state.
4. **Confetti / pop-up sloj** — `WelcomeConfetti` se montira u `PersonalModeView` na temelju `localStorage.show_welcome_animation`. Sam overlay je strukturalno bezopasan, ali trenutno se prikazuje **preko** standardnih home sekcija koje vire iza njega → pojačava utisak "stari home s overlayem". Nakon što izolacija u točki 1 prođe, confetti će sjediti preko quiet/guided viewa što je dosljedno.

Telemetrija (`guided_home_entered`, `guided_home_exited`) i server RPC `mark_guided_home_exited` ostaju netaknuti.

## Fix plan

### 1. `src/components/home/PersonalModeView.tsx` — stvarna izolacija

Kad `showGuidedLayout` true, **early return** minimalnog rendera. Ne dijeli render strukturu sa standardnim layoutom.

```text
if (showGuidedLayout) {
  return (
    <div className="min-h-dvh bg-background overflow-x-hidden pb-20">
      <div className="max-w-md mx-auto px-4 py-8">
        {status === 'zero_data' ? <ZeroDataQuietState ... />
                                : <GuidedHomeView ... />}
      </div>
      {showWelcome && <WelcomeConfetti ... onComplete={...} />}
      <BottomNav />
    </div>
  );
}
```

Što izostaje u guided/quiet renderu:
- `HomeHeader` (logo, greeting, search bar, Reports/Scan/Manual quick actions)
- `WalletViewModeChips`
- `TrialBanner`
- `FinancialAssistantDialog`, `AIInsightBubble`
- `SharedDialogs` (browse/edit/transfer/recurring dialogs)
- `ActiveProjectsStrip`, `PaymentSourcesSection`, `SummarySection`, `ActiveIssuesSection`, `TransactionListSection`, `QuickLinksSection`, `CashflowForecast`
- `WelcomeChecklist`

Što ostaje:
- `BottomNav` — globalna navigacija mora ostati funkcionalna (to nije "home sekcija").
- `WelcomeConfetti` overlay ako je `showWelcome` true — payoff za onboarding, sjeda preko quiet/guided viewa, ne preko stare home pozadine (jer je nema).

Standardni branch (else grana) ostaje neizmijenjen.

### 2. CTA wiring — pravi add-expense flow

U `PersonalModeView` dodaj `const { openManualAdd } = useReceiptScan();` i proslijedi callback umjesto `onExpenseDialogChange(true)`:

```text
onAddExpense={() => openManualAdd({ businessProfileId: activeBusinessProfileId })}
```

To je identičan entry point kao `ManualAddTriggerButton` u `HomeHeader` → otvara globalni `AddExpenseDialog` u manual modu (preživljava Android camera lifecycle, kao i ostatak appa).

Acceptance: klik na `Zabilježi prvi trošak` i `Dodaj još jedan` otvara isti dijalog koji se inače otvara preko `+` gumba u headeru.

### 3. `ZeroDataQuietState` — ukloni krivu "skip" semantiku

Tekstualni link `Preskoči za sada` trenutno zove `onDismiss` koji izlazi iz guideda. Per zaključanoj odluci, skip mora **ostati** u 0-data quiet state. Stoga:

- Ukloni `onDismiss` prop i tekstualni button iz `ZeroDataQuietState`.
- Quiet state ostaje quiet dok god je `expenseCount === 0` i `guided_home_exited_at IS NULL`. Izlazak je isključivo:
  - dodavanjem prvog unosa (prelaz na `guided`), ili
  - dosezanjem thresholda (auto-exit), ili
  - eksplicitnim "Otvori standardni prikaz" linkom u `GuidedHomeView` nakon ≥1 unosa.

Onboarding skip path već dolazi ovamo (per ranija implementacija) i sada stvarno ostaje u quiet state.

### 4. `GuidedHomeView` — nepromijenjeno osim CTA bindinga

- `onAddExpense` → `openManualAdd(...)` (kao u točki 2).
- Tekstualni "Otvori standardni prikaz" ostaje — to je legitiman manualni exit iz guided faze (1–2 unosa).

### 5. Confetti — provjeriti runtime

Nakon izolacije iz točke 1, `WelcomeConfetti` sjeda preko quiet viewa. Provjeriti u previewu da overlay:
- ne zaklanja CTA dugmad nakon `onComplete`,
- ne ostavlja artefakte iznad guided/quiet sloja.

Ako se runtime ponaša ispravno → ostaviti. Ako sudara → ograničiti mount na `!showGuidedLayout || showZeroOnly` (odluka u trenutku testa, ne unaprijed).

## Diranje fileova

- `src/components/home/PersonalModeView.tsx` — early return za guided/zero, useReceiptScan import, prosljeđivanje `openManualAdd`.
- `src/components/home/ZeroDataQuietState.tsx` — ukloni `onDismiss` prop i secondary tekstualni button, ukloni nekorišten i18n key iz call sitea.
- `src/i18n/locales/{hr,en,de}.json` — može ostati `guidedHome.zero.secondary` neiskorišten (mrtav ključ) ili obrisati. Plan: obrisati ključ u sva tri jezika da ne ostane dead i18n.

Bez DB migracija. Bez novih komponenti. Bez promjene RPC potpisa. `useGuidedMode` hook nepromijenjen.

## Testovi / build

- `npm test` — postojeći `src/test/guidedMode.test.ts` ostaje validan (čista logika, nepromijenjena).
- E2E `01-signup-onboarding.spec.ts` — provjeriti da test ne polaže `ZeroDataQuietState` dismiss linka (ako polaže, ukloniti taj korak iz E2E zajedno s UI promjenom).

## Runtime acceptance provjera (browser preview, viewport 384)

Nakon builda, kroz `browser--view_preview` provjeriti 4 scenarija sa živim `hr.akrobat@gmail.com` (već resetiran prije: `onboarding_completed=false`, 0 unosa, `guided_home_exited_at=NULL`):

1. **Complete path, 0 unosa** → `/home` prikazuje samo `ZeroDataQuietState`. Nema headera, search bara, action gumba, summary kartica, project stripa, issues, transaction liste, WelcomeChecklist. Vidljiv samo `BottomNav` na dnu.
2. **Skip path (klik "preskoči" u onboardingu), 0 unosa** → `/home` identično kao #1. Nigdje "Preskoči za sada" link unutar quiet statea (uklonjen).
3. **Klik "Zabilježi prvi trošak"** → otvara se globalni `AddExpenseDialog` (manual mode), isti koji se otvara preko `+` u standardnom headeru. Ne `TransactionListDialog`, ne search, ne reports.
4. **1 unos, još u guidedu** → `/home` prikazuje samo `GuidedHomeView` (week strip + zadnji unos + CTA + "Otvori standardni prikaz" link). Bez standardnih sekcija u pozadini. Klik CTA otvara stvarni add flow.

Ako confetti overlay vizualno sudara s quiet/guided viewom u koraku 1 ili 2, ograničiti ga na non-guided render.

## Regresijski rizici

- Standardni home (post-threshold ili post-exit) ostaje isti — early return ne dira `else` granu.
- BottomNav ostaje montirana u oba slučaja → cross-tab navigacija ne regresira.
- `openManualAdd` je već production-tested entry point (koristi ga `ManualAddTriggerButton`) → nema novog koda za camera lifecycle.

## Finalni sud

Plan je acceptance-driven, sve točke fix-a vežu se na konkretne linije koda potvrđene u istraživanju. Spreman za ulazak u build.
