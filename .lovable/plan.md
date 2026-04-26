## Profesionalan sustav za detekciju i prioritizaciju grešaka

### Što sam stvarno provjerio prije pisanja plana

1. **`app_diagnostics_logs` tablica** — 9 stupaca (id, session_id, user_id, event, route, details, device_info, app_version, created_at). Indeksi po event/route/session/created_at već postoje. RLS: insert anyone, select/delete admin only. **Nema `severity` stupca — moramo ga dodati.**
2. **Postojećih 22 tipova događaja** zadnjih 7 dana (provjereno SQL-om):
   - 633× `route_change`, 270× `boot_start`, 156× `performance_metric` → **info-razina (šum)**
   - 146× `unhandled_rejection`, 14× `window_error`, 14× `notify_invoke_http_error` → **error-razina**
   - Trenutno sve ide u jedan kanal → ne možeš razlikovati šum od pravih problema
3. **`ErrorBoundary.tsx`** ne logira u bazu — samo `console.error`. **Crash-evi cijele aplikacije nestaju.**
4. **`usePulseMetrics`** broji greške ali ne grupira po signaturi i ne broji "pogođene korisnike".

---

## Što radimo: Paket A + Paket B + Auto-deduplikacija

### **Paket A — Sveobuhvatno hvatanje + ozbiljnost**

#### 1. Migracija baze: dodati `severity` u `app_diagnostics_logs`

```sql
ALTER TABLE app_diagnostics_logs 
  ADD COLUMN severity text DEFAULT 'info' 
  CHECK (severity IN ('critical', 'error', 'warning', 'info'));

CREATE INDEX idx_app_diag_severity_time 
  ON app_diagnostics_logs (severity, created_at DESC) 
  WHERE severity IN ('critical', 'error');
```

Index je djelomičan (samo critical/error) → ostaje brz čak i s milijunima info redaka.

#### 2. Nadograditi `src/lib/diagnosticLogger.ts`

- Dodati `severity?: 'critical' | 'error' | 'warning' | 'info'` u `DiagnosticEventInput`
- **Auto-detekcija razine** ako nije eksplicitno zadana:
  - `window_error`, `unhandled_rejection`, `react_error_boundary`, `supabase_error`, `edge_function_error` → **error**
  - `performance_metric` (ako duration > 5s) → **warning**, inače **info**
  - `route_change`, `boot_start`, `splash_*` itd. → **info**
- **Auto-deduplikacija** (in-memory): hash signaturu (`event + message + route`), ako se isti hash javi unutar 60s → ne šaljemo novi red, nego inkrementiramo `count` na zadnjem bufferiranom redu (ili lokalno brojimo dok se ne flush-a). Razlika: 50 istih grešaka u sekundi → 1 red s `count: 50` umjesto 50 redaka.

#### 3. `ErrorBoundary.tsx` integracija

U `componentDidCatch`:
```ts
logDiagnostic({
  event: 'react_error_boundary',
  severity: 'critical',
  details: {
    message: error.message,
    stack: error.stack?.slice(0, 2000),
    componentStack: errorInfo.componentStack?.slice(0, 1000),
  }
});
```
Ovo je **najveća rupa** trenutno — kad se cijeli React stablo sruši, ne znamo. Nakon ovog popravka znamo odmah.

#### 4. Nova datoteka `src/lib/supabaseInvoke.ts` (wrapper)

Mali wrapper oko `supabase.functions.invoke()` koji:
- Mjeri trajanje
- Ako trajanje > 5s → logira `performance_metric` warning
- Ako vrati error → logira `edge_function_error` (severity error) sa statusom, porukom, imenom funkcije
- Ako baci → logira i ponovo baci (ne mijenja postojeći flow)

**Postojeće `supabase.functions.invoke` pozive NE mijenjam u ovom paketu** — samo dodajem wrapper kao opciju. U sljedećim iteracijama postupno migriramo "kritične" funkcije (notify-*, send-push, financial-assistant) na wrapper.

---

### **Paket B — Pulse UI po ozbiljnosti**

#### 5. Nadograditi `usePulseMetrics.ts`

Dodati u `PulseMetrics` interface:
- `errorsBySeverity: { critical: number, error: number, warning: number }` (za zadnji 1h i 24h)
- `topIssues: Array<{ signature: string, event: string, message: string, route: string, severity, count: number, affected_users: number, last_seen: string }>` — grupiraj `error`+`critical` događaje po `event + details.message`

SQL agregacija u jednoj query-iji (umjesto trenutne `rangeDataQ` koja vuče 5000 redaka):
```ts
// Top issues — grupiraj po event + message, brojanje + distinct user_id
const { data } = await supabase
  .from('app_diagnostics_logs')
  .select('event, route, details, user_id, created_at, severity')
  .in('severity', ['critical', 'error'])
  .gte('created_at', since24hIso)
  .order('created_at', { ascending: false })
  .limit(2000);
// + client-side groupBy
```

#### 6. Novi UI: `PulseTopIssuesSection.tsx`

Prikazano **iznad** "Top problematičnih ruta" — odmah najvažnija stvar. Format:

```
🔴 KRITIČNO (3)
  • React crash na /budgets — 4 korisnika, 12× zadnja 24h, prije 5 min  [Detalji]
  • Spremanje transakcije fail — 2 korisnika, 6×, prije 12 min  [Detalji]

🟠 GREŠKE (8) — kliknuti za prikaz
🟡 UPOZORENJA (15) — kliknuti za prikaz
```

Klik na red → existing `PulseAlertDetailDialog` (već postoji u kodu, ponovno koristim) s prikazom svih instanci, pogođenih sessiona, stack tracea.

#### 7. Nadograditi `PulseStatusBar.tsx`

Trenutno: samo broji `errors1h`. Promjena:
- Ako ima ≥1 **critical** u zadnjih 1h → status "Kritično" (crveno)
- Ako ima ≥3 **error** u zadnjih 1h → "Pozor" (žuto)
- Inače "Sustav OK" (zeleno)
Plus prikaz: "🔴 X · 🟠 Y · 🟡 Z" umjesto generičnog "Err 1h".

#### 8. (Mala dodana vrijednost) Filter chip iznad live feeda

Toggle gumbi: `Sve | Kritično | Greške | Upozorenja | Info`. Defaultno skriva info da admin panel nije zatrpan šumom.

---

### Što NE diram u ovom paketu

- Sva edge funkcije i njihova interna logika (push, financial-assistant, notify-*) — ostaju netaknute
- Postojeći `PulseAlertDetailDialog`, `PulseLiveFeed`, `PulsePerformanceSection`, `PulseAISummary` — koriste se kakvi jesu
- `monitor-app-health` cron — to je Paket D, čekamo 7 dana podataka prvo
- `monitor_ignored_signatures` tablica — to je Paket B "kasniji dio", radimo nakon što vidimo da li uopće treba (možda dedup riješi 90% buke)
- Linkanje frontend ↔ backend session-a (Paket C) — odgađamo dok ne porastemo

---

### Sažetak izmjena

| # | Datoteka / Akcija | Tip |
|---|---|---|
| 1 | `ALTER TABLE app_diagnostics_logs ADD COLUMN severity` | Migracija |
| 2 | `src/lib/diagnosticLogger.ts` | Severity + auto-dedup + auto-classify |
| 3 | `src/components/ErrorBoundary.tsx` | Logiranje kritičnih crash-eva u bazu |
| 4 | `src/lib/supabaseInvoke.ts` (NOVA) | Wrapper za edge funkcije s mjerenjem |
| 5 | `src/hooks/usePulseMetrics.ts` | Dodati `topIssues`, `errorsBySeverity` |
| 6 | `src/components/admin/PulseTopIssuesSection.tsx` (NOVA) | UI top-3 grupirane greške |
| 7 | `src/components/admin/PulseStatusBar.tsx` | Status po severity-u |
| 8 | `src/components/admin/PulseTab.tsx` | Integracija nove sekcije + filter |
| 9 | `src/i18n/locales/{hr,en,de}.json` | ~12 novih ključeva |

**Ukupno: 8 datoteka + 1 migracija + 3 i18n datoteke.**

---

### Trajanje
~25-30 minuta implementacije.

### Što očekujemo nakon deploya
- **Odmah**: vidiš u Pulse-u sortirano po važnosti — kritično prvo, šum sakriven
- **Sljedećih 24h**: ako React negdje crash-ne kod korisnika, vidiš to u panelu (do sada bi bilo nevidljivo)
- **Sljedećih 7 dana**: gledamo prave podatke, učimo što je normalan šum, pa eventualno krećemo s Paketom C/D s realnim pragovima

### Što ostaje za kasnije (svjesno)
- **Paket C** (linkanje frontend ↔ backend session preko `x-session-id`) — kad budemo imali 50+ aktivnih korisnika
- **Paket D** (smart push alerts adminu) — nakon 1-2 tjedna učenja podataka
- **Migracija postojećih `supabase.functions.invoke` poziva na `supabaseInvoke` wrapper** — postupno, kako diramo te dijelove koda

Reci "kreni" i implementiramo.