
# Family Split — Faza 3 (koraci 1–6)

Cilj: dovršiti family modul s pametnim prijedlozima, izvještajima, cashflow integracijom, relationship tagovima, reakcijama i push obavijestima za override.

Izvest ćemo **sekvencijalno** (svaki korak = zaseban deliverable + commit). Ne paralelno, jer su koraci 3 i 5 ovisni o stabilnoj snapshot bazi iz Faze 2.

---

## Korak 1 — Smart prompting (mode suggestion)

**Cilj:** kad grupa ima ≥3 mjeseca podataka i `split_mode='equal'`, sustav analizira stvarno trošenje i predlaže `proportional_income` ako bi to bilo "pravednije".

- Pure helper `src/lib/familySplitSuggestion.ts`:
  - `analyzeFairness(snapshots, members)` → vraća `{currentMode, suggestedMode, reason, gini}` (Gini koeficijent razlike doprinos vs trošak)
  - Threshold: prijedlog kad razlika člana > 25% od equal share kroz 3 mj.
- RPC `suggest_family_split_mode(group_id)` (SECURITY DEFINER, read-only)
- UI: `SplitModeSuggestionBanner` u `FamilyGroupDetailView` Pregled tabu (dismissible, localStorage 14d)
- vitest pokrivenost helpera (5+ scenarija: tied/skewed/insufficient data/already proportional/single member)
- i18n: `family.split.suggestion.*`

---

## Korak 2 — Monthly settlement PDF

**Cilj:** export mjesečnog obračuna (tko kome duguje, breakdown po članu/kategoriji).

- Helper `src/lib/familySettlementPdf.ts` — koristi postojeći `pdfReportKit.ts` i Teal branding
- Sekcije: header (grupa, period), summary tablica (član × doprinos × udio × saldo), netting matrix, audit changes u periodu
- Gumb "Export PDF" u `FamilySettlementsTab` header
- Native: koristi postojeći `fileExport.ts` + `FileSavedDialog` (Faza 2 export pipeline)
- i18n: `family.split.settlements.exportPdf.*`

---

## Korak 3 — Cashflow Forecast integracija

**Cilj:** uključiti predviđene family obveze (settlements) u 8-tjedni cashflow forecast.

- Proširiti `useCashflowForecast` (Faza 2 forecast hook) — dodati izvor `family_obligations`
- Helper `src/lib/familyForecastContrib.ts` — za svakog usera vraća listu predviđenih outflowa (vlastiti dio iz aktivnih settlement zapisa + projekcija do kraja perioda)
- UI: chip "Obiteljski obračun" u Cashflow Forecast viewu, klik → drill-down lista
- vitest helper (zero outflow/multiple periods/declined consent edge cases)
- i18n: `cashflow.familyObligations.*`

---

## Korak 4 — Relationship tagovi

**Cilj:** označiti članove kao `partner`/`child`/`roommate`/`parent`/`other` i koristiti to za default split pravila i prikaz.

- Migracija: `family_members.relationship` text CHECK in (`partner`,`child`,`roommate`,`parent`,`sibling`,`other`)
- Defaults po relationshipu (samo prijedlozi pri kreiranju, ne forsiraju se):
  - partner → proportional_income
  - child → excluded from split (samo contribution)
  - roommate → equal
- UI: `RelationshipPicker` u `FamilyMemberConsentCard` + invitation flow
- Badge u članstvu listi (mali icon + label)
- i18n: `family.relationship.*`

---

## Korak 5 — Reakcije/komentari na transakcije (BEZ chata)

**Cilj:** kratke emoji reakcije (👍 ❤️ ⚠️) i jednoredni komentar na shared transakcije. NE chat thread.

- Migracija: `family_transaction_reactions` (id, expense_id, user_id, emoji text, created_at, UNIQUE(expense_id, user_id, emoji))
- Migracija: `family_transaction_comments` (id, expense_id, user_id, body text max 280 znakova, created_at, deleted_at)
- RLS: vidljivo svim članovima grupe kojoj pripada `payment_source` transakcije; pisanje samo autor
- Hook `useFamilyReactions(expenseId)`, `useFamilyComments(expenseId)`
- UI: `FamilyReactionsBar` + `FamilyCommentsInline` u `TransactionDetailDialog` (samo kad je shared family source)
- Push odgođen za Korak 6 ovog plana (zajedno s override pushom)
- i18n: `family.reactions.*`, `family.comments.*`

---

## Korak 6 — Push za override + reakcije

**Cilj:** opt-in push notifikacija kad netko primijeni split override ili reagira na korisnikovu transakciju.

- Notification preferences proširiti: `family_override_push` boolean, `family_reactions_push` boolean (default oba `false` — opt-in)
- Edge function `notify-family-event` (CORS + JWT validate):
  - Trigger izvori: `apply_split_override` RPC + INSERT u `family_transaction_reactions`/`comments`
  - Filter: ne push autoru, ne push workerima (postoji obrazac iz `notify-project-transaction`)
  - Reuse FCM v1 pipeline iz postojećih notify edge functiona
- UI: 2 toggle prekidača u `NotificationsSection` (`family.notifications.override`, `family.notifications.reactions`)
- Dedup: za reakcije throttle 60s po (expense_id, recipient_id) preko `notifications.data.last_sent_at`
- i18n: notifikacije lokalizirane preko `notificationI18n.ts`

---

## Tehnički sažetak (za pregled prije starta)

- **Migracije:** 3 nove tablice (reactions, comments) + 1 kolona (relationship) + 2 prefs polja
- **Edge functions:** 1 nova (`notify-family-event`)
- **Helperi:** 3 nova pure helpera (suggestion, pdf, forecast) — svi s vitest testovima
- **i18n namespaces:** `family.split.suggestion`, `family.split.settlements.exportPdf`, `cashflow.familyObligations`, `family.relationship`, `family.reactions`, `family.comments`, `family.notifications`
- **Memory update:** dopuna `mem://features/family-proportional-split` na kraju zadnjeg koraka

## Procjena i rizici

- ~3–4 dana fokusiranog rada
- Rizik: PDF u koraku 2 zahtjeva snapshot podatke iz Faze 2 — provjeriti da je `family_split_snapshots` popunjen prije testa
- Rizik: push throttle u koraku 6 — koristit ćemo postojeći obrazac iz `check-budget-alerts` (push_sent_at u `data` jsonb)
- Reactions tablica može narasti — particioniranje odgođeno (kao i audit u Fazi 2)

---

**Krećemo s Korakom 1 — Smart prompting (helper + RPC + banner).** Nakon potvrde plana radim migraciju + helper + UI u istom rezu, pa nastavljam na Korak 2.
