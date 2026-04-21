

## Centar za nadzor aplikacije — sve 3 razine

Implementiramo kompletan sustav nadzora u 3 razine. Pažljivo, korak po korak, bez dirana postojeće logike.

---

### Razina 1 — Pulse Dashboard (real-time pregled)

**Novi tab "Pulse" u Admin panelu** (`Admin.tsx`), pored postojećeg "Diagnostic Logs":

**Status sustava (gornja traka):**
- 🟢 Sustav OK / 🟡 Pozor / 🔴 Greške — auto-boja na temelju zadnjeg sata
- Brojevi: aktivnih sesija (zadnjih 5 min), grešaka 1h, grešaka 24h

**Kartice s metrikama:**
- **Online sada** — broj jedinstvenih sesija s eventom u zadnjih 5 min
- **Greške 1h / 24h** — `window_error` + `unhandled_rejection` brojači
- **Top 5 problematičnih ruta** — rute s najviše grešaka u 24h
- **Verzije aplikacije** — distribucija `app_version` (otkriva tko nije ažurirao)
- **Live feed** — zadnjih 20 eventova s realtime subscription, color-coded badge

**Filter:** dropdown za vremenski raspon (5min / 1h / 24h / 7 dana)

**Tehnika:** SQL agregacijski upiti nad `app_diagnostics_logs`, realtime kanal za live feed, recharts za grafove (već u projektu).

---

### Razina 2 — Smart Alerts (proaktivne push obavijesti)

**Edge funkcija `monitor-app-health`** (cron svakih 5 min):
- Broji `window_error` + `unhandled_rejection` u zadnjih 5 min
- Grupira duplikate iste poruke
- Ako prelazi prag (default ≥3 različita usera ILI ≥10 ukupnih grešaka) → šalje **push notifikaciju adminima** preko postojećeg `send-push`
- Format: "🔴 V&M Balance: 5 grešaka u 5 min — najčešća: 'Cannot read property X'"
- Štiti od spama: ne šalje istu grupu dva puta unutar 30 min (tablica `monitor_alerts_log`)

**Nova mini-tablica `monitor_alerts_log`:**
- `id`, `alert_signature` (hash poruke+rute), `triggered_at`, `error_count`, `affected_users`
- RLS: samo admin čita
- Auto-cleanup nakon 30 dana

**UI sekcija "Alarmi" u Pulse tabu:**
- Lista poslanih alarma s vremenom, brojem grešaka, statusom (riješen / aktivan)
- Klik otvara detalje: koje sesije, koja ruta, stack trace
- Konfiguracija pragova (broj grešaka, vremenski prozor, broj usera) — sprema se u `localStorage` admina

**Cron raspored:** SQL `cron.schedule('monitor-app-health', '*/5 * * * *', ...)` — koristim insert tool jer sadrži anon key.

---

### Razina 3 — Performance & AI Insights

**Proširenje `diagnosticLogger.ts`:**
- Nova funkcija `logPerformance(action, durationMs, metadata)`
- Auto-mjerenje: `performance.timing` za page loads → log kao `page_load_perf` s trajanjem
- Wrapper za spore akcije (>2 s) — `withPerfTracking('add_expense', async () => {...})`
- Šalje se u **istu tablicu** `app_diagnostics_logs` (event = `performance_metric`, details sadrži duration_ms) — bez nove tablice, ostaje u 7-dnevnom cleanup-u

**Pulse tab — sekcija "Brzina aplikacije":**
- Prosječno vrijeme učitavanja po ruti (P50, P95)
- Top 5 najsporijih akcija u 24h
- Grafikon trendova kroz dan

**AI dnevni sažetak — gumb "📊 Generiraj izvještaj":**
- Edge funkcija `generate-health-summary` koristi Lovable AI Gateway (Gemini Flash Lite, besplatno)
- Skuplja zadnja 24h: greške, performance, top rute, verzije
- AI piše hrvatski/engleski/njemački pasus: *"U zadnja 24h: 47 sesija, 3 greške na ruti /wallet, prosječno učitavanje 1.2s. Korisnik X ima 5 ponovljenih grešaka — vjerojatno problem s offline modom."*
- Prikazuje se u Pulse tabu, sprema u `health_summaries` tablicu (zadnjih 30 dana)

**Mala tablica `health_summaries`:**
- `id`, `summary_date`, `summary_text`, `language`, `metrics_json`, `created_at`
- RLS: samo admin

---

### Datoteke koje se mijenjaju / kreiraju

| Datoteka | Akcija |
|---|---|
| `src/components/admin/PulseTab.tsx` | **NOVO** — glavni dashboard |
| `src/components/admin/PulseStatusBar.tsx` | **NOVO** — gornja traka statusa |
| `src/components/admin/PulseMetricCard.tsx` | **NOVO** — reusable metric card |
| `src/components/admin/PulseLiveFeed.tsx` | **NOVO** — realtime feed |
| `src/components/admin/PulseAlertsSection.tsx` | **NOVO** — Razina 2 alarmi |
| `src/components/admin/PulsePerformanceSection.tsx` | **NOVO** — Razina 3 brzina |
| `src/components/admin/PulseAISummary.tsx` | **NOVO** — AI dnevni izvještaj |
| `src/hooks/usePulseMetrics.ts` | **NOVO** — query hook za sve metrike |
| `src/pages/Admin.tsx` | Dodati novi tab "Pulse" prije "Diagnostic Logs" |
| `src/lib/diagnosticLogger.ts` | Dodati `logPerformance()` + auto page-load tracking |
| `src/i18n/locales/{hr,en,de}.json` | ~25 novih ključeva (admin.pulse.*) |
| **Migracija (schema)** | Nove tablice: `monitor_alerts_log`, `health_summaries` + RLS politike + cleanup funkcije |
| **Insert tool (SQL)** | Cron job `monitor-app-health` svakih 5 min |
| `supabase/functions/monitor-app-health/index.ts` | **NOVO** — Razina 2 detektor + push |
| `supabase/functions/generate-health-summary/index.ts` | **NOVO** — Razina 3 AI sažetak |

---

### Sigurnosne mjere (ne griješiti)

1. **Sve nove RLS politike** — `monitor_alerts_log` i `health_summaries` koriste `has_role(auth.uid(), 'admin')` — nitko osim admina ne čita
2. **Edge funkcije** — `monitor-app-health` koristi `SUPABASE_SERVICE_ROLE_KEY` (cron nema usera), `generate-health-summary` koristi admin JWT validaciju
3. **CORS headers** na svim edge response-ovima
4. **Postojeći logger ostaje netaknut** — samo dodajemo nove funkcije, ne mijenjamo postojeći flush/buffer/event capture
5. **Performance impact** — sve queryje s `LIMIT` i indexima na `(created_at)`, `(event)`, `(session_id)` (već postoje)
6. **AI Summary trošak** — Gemini Flash Lite, ~0 € po pozivu, max 1×/dan ručno
7. **Push spam zaštita** — alarmi grupirani po `alert_signature`, ne šalju se 2× u 30 min

---

### Što se NE mijenja

- Postojeći `DiagnosticLogsTab.tsx` (ostaje za detaljni debug)
- Postojeća `app_diagnostics_logs` tablica (samo dodatno koristimo)
- Postojeći `diagnosticLogger.ts` flush logika (samo dodajemo `logPerformance`)
- `usePushNotifications`, `send-push`, FCM v1 infrastruktura (samo pozivamo)
- RLS na drugim tablicama
- Bilo koja korisnička funkcionalnost

---

### Redoslijed implementacije (u ovom redu, da ne pukne)

1. Migracija: 2 nove tablice + RLS + indexi + cleanup funkcije
2. Razina 1: PulseTab + sve komponente metrika + dodavanje u Admin.tsx
3. Razina 2: edge funkcija `monitor-app-health` → cron job → AlertsSection UI
4. Razina 3: proširenje `diagnosticLogger.ts` → PerformanceSection → edge `generate-health-summary` → AISummary UI
5. i18n ključevi za sve nove tekstove (HR/EN/DE)
6. Vizualna provjera u Adminu (Diagnostic Logs i dalje radi, Pulse novi tab)

---

### Očekivani ishod

- Otvoriš **Admin → Pulse** i vidiš:
  - Trenutno: 🟢 Sustav OK, 8 online sesija, 0 grešaka u 1h, 17 u 24h
  - Top problematične rute, verzije korisnika, live feed
  - Dnevni AI sažetak na klik
- Kad netko dobije grešku → za **5 minuta** dobiješ push: "🔴 3 korisnika dobilo grešku na /projects"
- Sve to bez ikakvog utjecaja na korisničko iskustvo aplikacije

