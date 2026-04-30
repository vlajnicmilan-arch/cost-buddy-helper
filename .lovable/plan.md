
# Error poruke: human-friendly i prevedene

## Trenutno stanje

Brzi audit kroz codebase pokazuje:

- **352** ukupnih `showError()` / `toast.error()` poziva
- **103** od njih su **hardkodirane na hrvatskom** (zaobilaze `t()` funkciju → engleski/njemački korisnici vide hrvatski tekst)
- **2** mjesta prikazuju **sirovu Supabase grešku** (`error.message`) korisniku — npr. "Invalid JWT", "Network request failed"
- Postojeći `errors` namespace u prijevodima ima samo 6 generičkih ključeva — premalo

Najgori prekršitelji (po broju hardkodiranih poruka):
- `useFamilyGroups.ts` — 6+ poruka tipa "Račun je već dodan u grupu"
- `useCustomCategories.ts` — 5 poruka
- `useReceiptScanner.ts` — 6 poruka uklj. "Previše zahtjeva", "Nedostaje kredita"
- `useRecurringTransactions.ts`, `useCustomPaymentSources.ts`, `useExpenseCRUD.ts`, `NativeUpdateChecker.tsx`, `fileExport.ts`...

## Plan rada

### 1. Proširiti `errors` namespace u sva 3 jezika

Dodajem strukturirane podgrupe pokrivene tipičnim scenarijima:

```text
errors:
  generic, network, unauthorized, notFound, forbidden, timeout
  fetch:    expenses, categories, sources, projects, budgets, members, recurring, installments
  save:     generic, expense, category, source, project, budget, recurring
  delete:   generic, expense, category, source, project, budget
  family:   accountAlreadyAdded, budgetAlreadyAdded, projectAlreadyAdded, goalAlreadyAdded
            createGroupFailed, joinGroupFailed
  receipt:  cloudRequired, rateLimit, noCredits, scanCancelled, scanFailed
  auth:     mustBeLoggedIn, sessionExpired
  limits:   paymentSourcesReached, projectsReached, budgetsReached
  update:   webCheckFailed, platformUnsupported
  files:    saveFailed, shareFailed, importFailed
```

### 2. Mapper za sirove backend greške → prijateljske poruke

Novi helper `src/lib/errorMessages.ts`:

```text
formatErrorForUser(error, t, fallbackKey?) → string
```

Prepoznaje uobičajene Supabase / Postgres / Network signature (npr. `PGRST116`, `23505` duplicate, `42501` permission, `JWT expired`, `Failed to fetch`, `AbortError`) i vraća lokalizirani prijateljski tekst umjesto tehničkog stringa. Nepoznate greške → `errors.generic` + sirova poruka u `console.error` za dijagnostiku.

### 3. Refaktor 103 hardkodiranih poziva

Sustavno proći datoteke i zamijeniti `showError('Greška...')` sa `showError(t('errors.<grupa>.<ključ>'))`. Tamo gdje se danas šalje `error.message` direktno → koristiti novi mapper.

Prioritet (najveći utjecaj na korisnika):
1. **Auth flow** (`Auth.tsx`) — sirove Supabase poruke
2. **Hooks koje korisnik najčešće okida**: `useExpenseCRUD`, `useCustomCategories`, `useCustomPaymentSources`, `useRecurringTransactions`
3. **Family / collaboration** — `useFamilyGroups`
4. **Receipt scanner, native update, file export**

### 4. Lint pravilo (lagano)

Dodati komentar `// LINT: hardcoded user-facing string` provjeru u CI nije u opsegu — samo dokumentirati pravilo u memory: "Sve `showError` poruke moraju ići kroz `t()` ili `formatErrorForUser`".

## Tehnički detalji

- **Datoteke koje će se mijenjati**:
  - `src/i18n/locales/hr.json`, `en.json`, `de.json` — proširenje `errors` namespacea (~50 novih ključeva)
  - `src/lib/errorMessages.ts` — **NOVA** datoteka s mapperom
  - ~20 hook/komponentnih datoteka — zamjena hardkodiranih stringova

- **Ne mijenja se**:
  - `useStatusFeedback.ts` (showError API ostaje isti — string in, status feedback out)
  - Postojeći `t()` pozivi koji već rade (249 od 352)
  - DB shema, edge funkcije

- **Backwards compat**: Sve nove poruke imaju `defaultValue` fallback (drugi argument u `t()`) tako da ako prijevod nedostaje, korisnik dobije razuman hrvatski tekst umjesto raw key-a.

- **Verifikacija**: nakon refaktora pokrenem `rg "showError\(['\"]"` da potvrdim 0 hardkodiranih stringova ostaje, te `rg "showError\((error|err|e)\.message\)"` mora biti 0.

## Što korisnik dobiva

| Prije | Nakon |
|---|---|
| EN korisnik vidi: "Greška pri kreiranju grupe" | "Failed to create group. Please try again." |
| DE korisnik vidi: "Račun je već dodan u grupu" | "Dieses Konto ist bereits in der Gruppe." |
| Korisnik vidi: "Invalid JWT: token expired" | "Vaša sesija je istekla. Prijavite se ponovno." |
| Korisnik vidi: "duplicate key value violates unique constraint" | "Stavka s tim nazivom već postoji." |

## Opseg potvrde

Ovo je srednje velika promjena (~20 datoteka, ~50 novih i18n ključeva × 3 jezika = ~150 prijevoda + novi helper). Bez DB migracija, bez novih dependency-ja. Implementiram nakon odobrenja.
