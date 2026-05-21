# Dashboard Refokus — Plan

Cilj: pretvoriti dashboard iz "feature wall" u "operational command center". **Ništa se ne briše** — samo se premješta s glavnog ekrana u logičnije ulaze. Sve dosadašnje funkcionalnosti ostaju dostupne, 1 tap dalje.

## Odluke (iz prethodnog razgovora)

1. **Hero = Aktivni Projekti** ako ih korisnik ima (bez obzira na `usage_profile`). Fallback: Saldo + izvori.
2. **Sekundarni ulazi = miks** (logički raspoređeno, ne sve u jedan tab).
3. **Telemetrija paralelno** s redizajnom (ne čekamo 2 tjedna).

## Novi raspored dashboarda

```text
┌─────────────────────────────────┐
│ HomeHeader (search, +, settings)│
│ WalletViewModeChips             │
│ TrialBanner                     │
├─────────────────────────────────┤
│ HERO:                           │
│  ako ima aktivnih projekata →   │
│    ActiveProjectsStrip (veliki) │
│  inače →                        │
│    Saldo + Izvori plaćanja      │
├─────────────────────────────────┤
│ AI Insights (operativni)        │
├─────────────────────────────────┤
│ Saldo kompaktno (ako hero=proj.)│
│ ili Aktivni projekti kompaktno  │
│ (ako hero=saldo, a ima ih)      │
├─────────────────────────────────┤
│ Zadnje transakcije (5)          │
│ → "Sve transakcije" link        │
├─────────────────────────────────┤
│ Footer                          │
└─────────────────────────────────┘
```

**Što se MIČE s dashboarda** (i kamo):

| Sekcija | Trenutno | Novo mjesto |
|---|---|---|
| SummarySection (4 velike kartice: Prihodi/Rashodi/Prijenosi/Recurring) | Dashboard | Kompaktna verzija (2 kartice: Prihodi/Rashodi). Prijenosi+Recurring → ulaz u Novčanik tab. |
| CashflowForecast Collapsible | Dashboard | Izvještaji tab (postoji već) + kratki "Cashflow" link iz Novčanika. |
| QuickLinksSection (Wallet/Projects/Budgets shortcuts) | Dashboard desni stupac | BottomNav već pokriva — ukloniti. |
| SavingsGoalsSection | Dashboard (importan, vidim u importima) | Novčanik tab → sekcija "Ciljevi". |
| BusinessDebts strip + UnpaidInvoicesWidget | Dashboard (samo business) | Ostaje na dashboardu u business chip viewu — to JE operativno za poduzetnika. |
| Uvoz CSV/PDF | HomeHeader meni | Ostaje (već nije na ploči). |
| Budžeti preview | QuickLinks | Budžeti tab (postoji). |

**Što OSTAJE na dashboardu:**
- HomeHeader, WalletViewModeChips, TrialBanner
- Hero (Projekti ili Saldo, adaptivno)
- AI Insights (samo formulacija postaje operativnija — vidi sljedeću fazu)
- Sekundarni info blok (kompaktni Saldo ili kompaktni Projekti)
- Zadnjih 5 transakcija + "Vidi sve"
- Business: Debts + UnpaidInvoices (kontekstualno)

## Telemetrija (paralelno)

Dodati `dashboard_section_click` i `dashboard_section_view` u `funnel_events` (postojeća tablica + `logFunnelEvent` helper). Eventi:
- `dashboard.section.view` s `{section: 'projects'|'balance'|'insights'|'transactions'|'cashflow'|'goals'|...}`
- `dashboard.section.click` s istim payloadom
- `dashboard.scroll_depth` (25/50/75/100%)

Dodati prikaz u admin `PulseFunnelEvents` widget kao agregirani heatmap po sekcijama. Za 2 tjedna imamo podatke da validiramo (ili revertamo) odluku o premještanju.

## Reverzibilnost

Iza feature-flaga `dashboard_v2` (localStorage + Admin toggle). Po defaultu uključeno za nove korisnike, opcionalno za postojeće u Postavkama → "Klasični prikaz". Tako da:
- ne razbijemo workflow postojećim korisnicima preko noći
- možemo A/B usporediti engagement metrike
- ako podaci pokažu da je odluka loša, jednim toggle-om vraćamo

## Implementacijski koraci

1. **Feature flag** `dashboard_v2` u `useAppState` + toggle u Settings → Display.
2. **Novi `PersonalModeView` raspored** iza flaga (alternativna grana renderiranja, ista props površina, bez novih hookova).
3. **Hero komponenta** `<DashboardHero>` koja interno bira: Projekti hero (ako `projects.filter(p => p.status==='active').length > 0`) ili Saldo hero.
4. **Premještanje sekcija** u postojeće tabove:
   - `SavingsGoalsSection` → ubaciti u `Wallet.tsx` ispod izvora plaćanja
   - `CashflowForecast` → ubaciti u `Dashboard`/Izvještaji ekran (provjeriti postoji li tab)
   - Brisanje `QuickLinksSection` iz dashboarda (BottomNav pokriva)
5. **Kompaktna `SummarySection` varijanta** (prop `compact`) — samo Prihodi/Rashodi, bez Prijenosa/Recurringa (oni ostaju dostupni u Novčaniku).
6. **Telemetrija** — wrap-helper `<TrackSection name="...">` koji emitira view i delegira click eventove.
7. **i18n** — novi ključevi `dashboard.v2.*` (HR/EN/DE), ništa hardkodirano.
8. **Bez DB migracije** za sam redizajn. Telemetrija koristi postojeću `funnel_events` tablicu.

## Što NIJE u opsegu (zaseban plan kasnije)

- **AI Insights operativizacija** ("Projekt Duje gubi maržu" umjesto "83% manje na transport"). Veći zahvat u `generate-ai-insights` edge funkciji. Predlažem zasebno nakon što ovaj refokus bude live.
- **Promjena BottomNav-a** — ne diramo.
- **Brisanje feature-a** — ništa se ne briše.

## Rizici

- Postojeći power-useri koji su navikli na Cashflow/Recurring/Goals direktno na ploči — mitigacija: feature flag + Postavke toggle + telemetrija.
- `usage_profile=finance_only` korisnici nemaju projekte → automatski dobiju Saldo hero (već pokriveno fallback logikom).
- Business chip view ima dodatne widgete (Debts, UnpaidInvoices) — oni ostaju jer su operativni za business kontekst.

## Verifikacija

- Manual QA na 384px viewportu: oba hero varijanta, sa i bez projekata, personal i business chip.
- Provjeriti da SavingsGoals i CashflowForecast još uvijek rade nakon premještanja.
- Provjeriti da `funnel_events` dobiva nove eventove (preko `supabase--read_query`).
- Toggle "Klasični prikaz" mora reverzibilno vratiti staru ploču bez gubitka stanja.
