

# Sveobuhvatna revizija aplikacije VM Balance

Analiza iz perspektive 6 različitih stručnjaka, redom.

---

## 1. 🔒 Sigurnosni auditor

**Automatizirani scan: 6 nalaza (svi warn razina, 0 kritičnih)**

| Problem | Razina | Opis |
|---------|--------|------|
| `email_unsubscribe_tokens` čitljiv | ⚠️ | Autentificirani korisnici mogu čitati email tokene drugih korisnika |
| `suppressed_emails` čitljiv | ⚠️ | Lista suppressed emailova dostupna svim auth korisnicima |
| `email_send_log` čitljiv | ⚠️ | Log slanja emailova s adresama primatelja dostupan |
| `public-assets` bucket otvoren | ⚠️ | Svaki auth korisnik može uploadati u bucket bez path-scoping |
| Realtime kanali bez RLS | ⚠️ | Korisnici mogu subscribati na tuđe kanale |
| `project_invitations` dostupne unauthenticated | ⚠️ | Policy na `{public}` umjesto `{authenticated}` |

**Database linter: 0 problema** — RLS je uključen na svih 66 tablica. ✅

**Pozitivno:**
- Sve tablice imaju RLS uključen
- Osjetljivi podaci (API ključevi, certifikati) prethodno uklonjeni iz `business_profiles`
- Security definer funkcije imaju `search_path = public`
- Auth koristi email verifikaciju, PIN lock, biometriju

**Preporuka (3 brza fixa):**
1. Dodati RESTRICTIVE RLS na `email_unsubscribe_tokens`, `suppressed_emails`, `email_send_log` → blokirati auth korisnike
2. Path-scoping na `public-assets` bucket: `(storage.foldername(name))[1] = auth.uid()::text`
3. `project_invitations` policy prebaciti s `{public}` na `{authenticated}`

---

## 2. 🎨 UX/UI dizajner

**Viewport: 384×709px (mobilni fokus) — ispravno**

**Pozitivno:**
- Bottom nav s animiranim indikatorom — čisto i jasno
- Safe area padding za notch uređaje
- Haptics feedback na navigaciju
- Lazy loading svih stranica
- Dobra empty state komponenta
- Receipt viewer upravo popravljen i radi odlično

**Uočeni problemi:**
- **AddExpenseDialog: 2304 linija** — prevelika komponenta, teška za navigaciju i održavanje. Vjerojatno ima previše koraka/polja odjednom
- **SettingsDialog: 2039 linija** — isti problem, trebalo bi razbiti na tabove/sekcije
- **Index.tsx: 1068 linija** — glavni ekran je monolitan
- **Nedostaje skeleton loading** — `PageLoader` je samo spinner, trebao bi biti skeleton za bolji perceived performance
- **Navigacija**: 5 tabova u bottom nav (Pregled, Kalendar, Budžeti, Novčanik, Obitelj) — na rubu maksimuma, ali ok za sada

**Preporuka:**
1. Razbiti `AddExpenseDialog` na stepper komponente
2. `SettingsDialog` razbiti na podsekcije s vlastitim routeovima ili tabovima
3. Dodati skeleton loading umjesto spinnera

---

## 3. 🧪 QA inženjer

**Pozitivno:**
- Vitest + Testing Library postavljeni
- Error boundary na root razini
- Offline banner za network status
- PWA update prompt

**Uočeni problemi:**
- **Samo 1 test datoteka** (`src/test/example.test.ts`) — praktički nema testova
- **72.606 linija koda, ~0 testova** — kritično nedostatak pokrivenosti
- **Nema E2E testova** — niti Cypress niti Playwright
- **K6 stress test postoji** ali je samo za load testing, ne funkcionalno
- **Service Worker deregistracija** u preview/iframe — dobra praksa ✅
- **ErrorBoundary** postoji ali treba provjeriti pokriva li sve rute

**Preporuka:**
1. Prioritetno: auth flow testovi (signup, login, reset password)
2. CRUD testovi za expenses (dodaj, uredi, briši)
3. E2E test za receipt upload → pregled → cloud save flow

---

## 4. ⚡ Frontend performance inženjer

**Bundle analiza:**
- 82 npm dependency-ja (dosta za SPA)
- `framer-motion` koristi se i na Landing i u BottomNav — velik bundle za animacije
- `recharts` — heavy charting library
- `jspdf` + `jspdf-autotable` — PDF generiranje, trebalo bi biti lazy loaded
- `react-markdown` — rijetko korišten, trebalo bi biti lazy
- `@sentry/react` — ok za monitoring ali dodaje ~30KB

**Pozitivno:**
- Sve stranice su `lazy()` loaded ✅
- QueryClient za data caching ✅
- `@tanstack/react-virtual` za virtualizirane liste ✅

**Uočeni problemi:**
- `queryClient` kreiran izvan komponente bez konfiguracije — default `staleTime: 0` znači refetch na svaki mount
- Capacitor plugini (camera, geolocation, biometric, push) — svi se bundlaju čak i za web korisnike
- `react-confetti` — import za nešto što se koristi jednom
- `i18next` loadira sve 3 locale odjednom umjesto lazy per-language

**Preporuka:**
1. Postaviti `staleTime: 5 * 60 * 1000` na queryClient za manje refetchanja
2. Dynamic import za `jspdf`, `react-confetti`, `react-markdown`
3. Razmotriti zamjenu `framer-motion` za CSS animacije na BottomNav

---

## 5. 🌍 Prevoditelj / Copywriter

**Statistika:**
- HR: 1675 ključeva
- EN: 1715 ključeva (40 više)
- DE: 1692 ključeva

**Nedostajući ključevi:**

| Nedostaje u | Broj | Primjeri |
|-------------|------|----------|
| HR (iz EN) | 44 | `bulk.*` (13 ključeva), `reports.*` (31 ključ) — čitave sekcije bulk operacija i reporta |
| DE (iz EN) | 44 | Isti ključevi kao HR |
| EN (iz HR) | 4 | `settings.multiCurrency*` |
| DE (iz HR) | 4 | `settings.multiCurrency*` |

**Problem:** Korisnik koji koristi HR ili DE verziju i otvori bulk operacije ili reporte vidjet će engleske fallback stringove umjesto prevedenog teksta.

**Preporuka:**
1. Prevesti 44 ključa za `bulk.*` i `reports.*` u HR i DE
2. Prevesti 4 `multiCurrency` ključa u EN i DE
3. Dodati lint pravilo koje provjerava paritet ključeva

---

## 6. 📋 Product Manager

**Pregled značajki:**
- Osobne i poslovne financije u jednoj aplikaciji
- Multi-platform: Web PWA + Android (Capacitor)
- Oblak + lokalni storage modus
- Projekti, budžeti, obitelj, installments, recurring, savings, calendar
- AI asistent, receipt scanning, CSV import, bank connection
- Multi-valuta, 3 jezika
- Subscription/trial model

**Pozitivno:**
- Izuzetno bogat feature set za osobnu financijsku aplikaciju
- Dobra arhitektura s razdvojenim cloud/local modom
- Onboarding flow postoji
- Trial → Paywall flow implementiran
- Deep links za dijeljenje (join-project, join-budget, join-family)

**Rizici:**
- **Feature bloat** — 66 tablica, 326 TS/TSX datoteka, ogromna kompleksnost za održavanje
- **Testova nema** — svaka promjena rizikuje regresiju
- **Komponente prevelike** — AddExpenseDialog (2304 linija) je nemoguć za novog developera
- **Nedostaje analytics** — nema tracking-a key user actions osim login loga

**Preporuka za sljedeći kvartal:**
1. **Stabilizacija** — zamrznuti nove feature-e, fokus na testove i refactoring velikih komponenti
2. **Sigurnosni fixevi** — 6 nalaza, svi brzo popravljivi
3. **Prijevodi** — dovršiti 44+4 ključa
4. **Performance baseline** — postaviti Lighthouse/CWV mjerenja

---

## Sažetak prioriteta (po hitnosti)

| # | Područje | Akcija | Težina |
|---|----------|--------|--------|
| 1 | Sigurnost | Popraviti 6 RLS/bucket nalaza | Laka |
| 2 | Prijevodi | Dodati 48 nedostajućih ključeva | Laka |
| 3 | Performance | QueryClient staleTime + dynamic imports | Laka |
| 4 | QA | Napisati osnovne auth + CRUD testove | Srednja |
| 5 | UX | Razbiti AddExpenseDialog i SettingsDialog | Srednja |
| 6 | Product | Uspostaviti analytics i Lighthouse baseline | Srednja |

