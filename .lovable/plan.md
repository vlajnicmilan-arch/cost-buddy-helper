## Cilj

Dodati profilni izbor u onboarding tako da novi korisnici sami biraju razinu kompleksnosti aplikacije:

1. **Korak A** (svima): "Što želiš pratiti?" → samo osobne financije / financije + projekte
2. **Korak B** (samo ako odabere projekte): usporedba Free / Pro / Business planova
3. **Sakriti** "Projekti" iz BottomNav-a ako korisnik odabere samo financije
4. **Postavke** dobivaju "Profil korištenja" sekciju za promjenu kasnije
5. **Postojeći korisnici se ne diraju** — zadržavaju trenutno stanje

## Korisničko iskustvo

```text
Step 1 [name]  →  Step 2 [NEW: profil]  →  Step 3 [NEW: planovi*]  →  Step 4 [sources]  →  Step 5 [cards]
                                          (* samo ako "i projekte")
```

**Korak 2 — "Što želiš pratiti?"**
Dvije velike kartice:
- 🪙 **Samo osobne financije** — "Praćenje prihoda, rashoda i budžeta. Idealno za osobnu upotrebu." (preporučeno za većinu)
- 🗂️ **Financije + projekti** — "Sve gore + vođenje projekata, klijenata, radnika i milestoneova. Za freelance, obrt i tvrtke."

**Korak 3 — "Odaberi plan"** (samo ako odabrao projekte)
Tablica/3 kartice s usporedbom (Free / Pro / Business). Reuse postojeći paywall stil.
- Korisnik MOŽE odabrati Free i nastaviti → ide u Pro/Business onboarding kasnije kad udari u limit
- Korisnik MOŽE kliknuti "Aktiviraj Pro/Business" → ide na checkout, po povratku nastavlja sources korak

## Tehnička izvedba

### 1. Novi flag: `usage_profile`
- Vrijednosti: `'finance_only'` | `'finance_projects'`
- Pohrana: `localStorage` + Postavke koriste isti pristup kao `business_mode_enabled`
- Migracija postojećih korisnika: ako `onboarding_completed === 'true'` i nema `usage_profile`, **NE postavljaj ništa** — tretiraj kao "legacy" → pokaži sve tabove (bez promjena u UX-u, kao i dosad)

Dodati u `AppStateContext.tsx`:
```ts
const [usageProfile, setUsageProfileState] = useState<'finance_only' | 'finance_projects' | null>(
  () => (localStorage.getItem('usage_profile') as any) || null
);
const setUsageProfile = (p) => { localStorage.setItem('usage_profile', p); setUsageProfileState(p); };
```

### 2. BottomNav: sakrij Projekte za `finance_only`
U `src/components/BottomNav.tsx`:
```ts
const navItems = allNavItems.filter(item => {
  if (item.path === '/family') return familyModeEnabled && !activeBusinessProfileId;
  if (item.path === '/projects') {
    // Legacy korisnici (null) i 'finance_projects' → vidljivo. 'finance_only' → sakriveno.
    return usageProfile !== 'finance_only';
  }
  return true;
});
```

Također sakriti druge ulaze u projekte: `ActiveProjectsStrip`, `ProjectOnboardingHint` na Dashboardu, eventualne quick-action gumbe u Home view-u.

### 3. Onboarding flow (`src/pages/Onboarding.tsx`)
- Promijeniti `totalSteps` iz 3 u **dinamički** (4 ili 5, ovisno o izboru)
- Step 2 (novi): `OnboardingUsageProfileStep` — dvije velike kartice
- Step 3 (novi, conditional): `OnboardingPlanStep` — usporedba Free/Pro/Business; reuse logiku iz `src/pages/Paywall.tsx` (postojeći checkout flow)
- Step 4: postojeći "izvori"
- Step 5: postojeći "kartice"
- Skip gumb i dalje radi (postavi `usage_profile = 'finance_only'` kao siguran default)

### 4. Postavke — "Profil korištenja"
Nova sekcija u `Settings` (provjeriti gdje se već nalazi `business_mode_enabled` toggle pa staviti pored):
- Radio/segmented control: "Samo financije" | "Financije + projekti"
- Promjena trenutno samo (ne)skriva tab — ne briše podatke
- Ako prebaci s "projekti" na "samo financije" i ima aktivnih projekata → confirm dialog ("Tvoji projekti ostaju spremljeni, samo se sakrivaju iz navigacije")

### 5. Funnel tracking
Dodati novi event u `logFunnelEvent`:
- `usage_profile_selected` s `{ profile: 'finance_only' | 'finance_projects' }`
- Pri završetku onboardinga već postojeći `onboarding_complete` event proširi s `usage_profile`

Update `PulseFunnelEvents` admin widget da prikaže razdiobu profila.

### 6. i18n ključevi (HR, EN, DE)
Novi namespace `onboarding.usageProfile.*`:
- `title`, `subtitle`
- `financeOnly.label`, `financeOnly.desc`, `financeOnly.recommended`
- `financeProjects.label`, `financeProjects.desc`
- `plan.title`, `plan.subtitle`, `plan.startFree`, `plan.activatePro`, `plan.activateBusiness`

I `settings.usageProfile.*` za Postavke sekciju.

## Lista promjena

**Novi fajlovi:**
- `src/components/onboarding/OnboardingUsageProfileStep.tsx`
- `src/components/onboarding/OnboardingPlanStep.tsx`
- `src/components/settings/UsageProfileSection.tsx`

**Izmijenjeni fajlovi:**
- `src/contexts/AppStateContext.tsx` (dodati `usageProfile`, `setUsageProfile`)
- `src/pages/Onboarding.tsx` (dinamički stepovi, integracija novih koraka)
- `src/components/BottomNav.tsx` (filter za `/projects`)
- `src/pages/Dashboard.tsx` ili `src/components/home/PersonalModeView.tsx` (sakriti `ActiveProjectsStrip` i `ProjectOnboardingHint` ako `finance_only`)
- Settings stranica/komponenta (mount `UsageProfileSection`)
- `src/lib/funnelTracking.ts` (novi event tip)
- `src/components/admin/PulseFunnelEvents.tsx` (prikaz profila)
- `src/i18n/locales/{hr,en,de}.json` (novi ključevi)

**DB:** nema promjena — sve u `localStorage`. (Možemo sinkronizirati u `profiles.usage_profile` u kasnijoj fazi ako bude potrebno za cross-device, ali za sad lokalno je dovoljno i konzistentno s `business_mode_enabled`.)

## Što NIJE u opsegu

- Promjena postojećeg paywall ekrana (samo ga reusamo u Korak 3)
- Auto-detekcija profila iz postojećih podataka (postojeći korisnici se ne diraju)
- Brisanje projekata kad korisnik prebaci na "samo financije" (samo skrivanje)
- Posebne preset templates po profilu (to je drugi prioritet iz prethodne analize)

## Pitanja za potvrdu prije implementacije

Nemam blokirajućih pitanja — sve potrebne odluke su pokrivene tvojim odgovorima. Ako odobriš plan, krećem redom: AppStateContext → Onboarding stepovi → BottomNav filter → Settings sekcija → i18n → funnel.
