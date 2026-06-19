## Wave 1 polish — onboarding/guided home

Uski rez. Bez novog scopea.

### Rez 1 — jedan payoff (zadržati StepReady, ukloniti home overlay)

Trigger lanca koji se uklanja:

```text
Onboarding.tsx:211  localStorage.setItem('show_welcome_animation','true')
        │
Index.tsx:131-134   čita flag → setShowWelcome(true) → briše flag
        │
Index.tsx:576       showWelcome={showWelcome}  → PersonalModeView
        │
PersonalModeView:113 prop  + :211 i :534 renderiraju <WelcomeConfetti>
```

Promjene:
- `src/pages/Onboarding.tsx` — ukloniti `localStorage.setItem('show_welcome_animation', ...)`.
- `src/pages/Index.tsx` — ukloniti `showWelcome` useState, effect koji čita flag, prop predan `PersonalModeView`-u.
- `src/components/home/PersonalModeView.tsx` — ukloniti `showWelcome` / `onWelcomeComplete` iz propsa, oba `<WelcomeConfetti>` bloka (linije ~211 i ~534), unused import.
- `src/components/WelcomeConfetti.tsx` — ostaje (Auth.tsx ga još koristi za login povratak — izvan scope-a).

`StepReady` ostaje netaknut.

### Rez 2 — uklanjanje `Otvori standardni prikaz`

Promjene:
- `src/components/home/GuidedHomeView.tsx` — ukloniti `<button onDismiss>` blok na dnu, `onDismiss` iz propsa.
- `src/components/home/PersonalModeView.tsx` — ukloniti `onDismiss={() => guided.exit('manual_dismiss')}` call site.
- `src/hooks/useGuidedMode.ts` — `exit` tip reducirati na `reason?: 'threshold_reached'` (auto-exit jedini path).
- `src/i18n/locales/{hr,en,de}.json` — ukloniti ključ `guidedHome.guided.skip`.

Ne dirati:
- `shouldAutoExitGuided` / threshold logiku
- ostatak `guidedHome.guided.*` copyja
- funnel event `guided_home_exited` (samo reason vrijednost ostaje `threshold_reached`)

### Verifikacija
- `npm test` (vitest, uključujući `src/test/guidedMode.test.ts`)
- Build pass
- Runtime: nakon onboardinga → StepReady confetti → `/home` quiet/guided **bez** drugog overlaya; u guided viewu nema "Otvori standardni prikaz" linka; auto-exit na 3. unosu nastavlja raditi.

### Files dirani
- src/pages/Onboarding.tsx
- src/pages/Index.tsx
- src/components/home/PersonalModeView.tsx
- src/components/home/GuidedHomeView.tsx
- src/hooks/useGuidedMode.ts
- src/i18n/locales/hr.json
- src/i18n/locales/en.json
- src/i18n/locales/de.json
