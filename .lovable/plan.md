
# Plan: Notifications → Active Issues sustav

## Cilj
Notifications postaju "issues" s lifecycleom. Dashboard pokazuje samo `active`, automatski auto-resolva kad detektor ne vidi problem. AI se ne zove na svaki uvid — samo opcionalno za nijansirane.

---

## 1. DB migracija — proširenje `notifications`

Dodati kolone:
- `status` text DEFAULT 'active' CHECK IN ('active','resolved','dismissed')
- `severity` text DEFAULT 'info' CHECK IN ('info','warning','critical')
- `dedup_key` text (npr. `project_loss_zone:<projectId>`)
- `entity_type` text NULL (npr. `project`, `invoice`, `budget`)
- `entity_id` uuid NULL
- `resolved_at` timestamptz NULL
- `dismissed_at` timestamptz NULL
- `last_seen_at` timestamptz DEFAULT now() (za "ponovno detektiran" bez stvaranja duplikata)

Indeksi:
- `(user_id, status)` za brzi dohvat aktivnih
- UNIQUE `(user_id, dedup_key) WHERE status = 'active'` — sprječava duplikate

Backfill: postojeće notifikacije dobiju `status='active'`, `severity` izvedeno iz `type` (npr. `project_loss_zone` → `warning`).

RLS: postojeće policies se zadržavaju (user vidi svoje); dodati RPC `dismiss_notification(id)` i `resolve_notification_by_dedup(dedup_key)` (SECURITY DEFINER) — usklađeno s ostalim RPC-jevima u projektu.

---

## 2. Helper sloj — `src/lib/issueDetection.ts` (novi)

Pure funkcije, testabilne s vitest (slijedi Testing Priorities):

```ts
type IssueCandidate = {
  dedup_key: string;
  type: string;
  severity: 'info'|'warning'|'critical';
  title: string;          // template (i18n key)
  message: string;        // template (i18n key + vars)
  entity_type?: string;
  entity_id?: string;
  data?: Record<string, unknown>;
};

detectProjectLossZone(projects, expenses) → IssueCandidate[]
detectOverdueInvoices(invoices, today) → IssueCandidate[]
detectBudgetBurn(budgets, expenses) → IssueCandidate[]
detectCashflowRisk(recurring, balance, horizon=30d) → IssueCandidate[]
```

Razlog: detekcija je pure logika → vitest pokrivenost (pravilo "bug → helper → test").

---

## 3. Reconciler hook — `useIssueReconciler.ts` (novi)

Pokreće se 1× na load dashboarda (i kad se invalidiraju expense/project queries).

Tok:
1. Pokupi sve `active` notifikacije s `dedup_key IS NOT NULL` za usera.
2. Pokreni svih 4 detektora → skup `detected` (Map po `dedup_key`).
3. Za svaki `detected`:
   - Ako postoji aktivna s istim `dedup_key` → UPDATE `last_seen_at` + `data` (bez stvaranja nove, bez push spamanja).
   - Ako ne postoji → INSERT novu `active`.
4. Za svaki `active` koji **nije** u `detected` (i ima dedup_key iz naših detektora) → UPDATE `status='resolved', resolved_at=now()`.

Bez AI poziva u MVP-u. Tekst dolazi iz i18n templatea.

`useProjectLossZoneAlert` postaje deprecated → zamijenjen ovim reconcilerom (isti dedup_key format).

---

## 4. UI — `AIInsightsSection` → `ActiveIssuesSection`

Rename + refactor:
- Izvor podataka: `useActiveIssues()` (query `notifications WHERE status='active'`, ORDER BY severity desc, created_at desc).
- Zadržati postojeći `AIInsightCard` izgled (border-l po severity), ikona po `type`.
- Naslov: `t('attention.title')` već postoji.
- Klik → akcija (open_project/open_invoice) ostaje ista kao sad.
- Dodati **Dismiss** gumb (X) → poziva `dismiss_notification` RPC + optimistic update.
- `useAIInsights` hook + edge function `generate-ai-insights` + tablica `ai_insights_cache` → **ne brisati u ovoj fazi**, samo prestati koristiti na dashboardu. Označiti kao deprecated; uklanjanje u zasebnom commitu nakon validacije.

Cap: max 5 prikazanih, ostalo "Prikaži još" expandable.

---

## 5. i18n

Novi keyovi pod `attention.issues.*`:
- `lossZone.title` / `lossZone.message` (vars: projectName, marginPct)
- `overdueInvoice.title` / `.message` (vars: invoiceNumber, daysOverdue, amount)
- `budgetBurn.title` / `.message` (vars: budgetName, spentPct)
- `cashflowRisk.title` / `.message` (vars: daysAhead, shortageAmount)
- `actions.dismiss`

HR primarno, EN/DE odmah.

---

## 6. Što NE radim u ovoj fazi

- **Bez nove `issues` tablice** (odluka A).
- **Bez cron edge funkcije** — samo client-side reconciler. Server-side detekcija + push dolazi u sljedećoj fazi (može se nakalemiti na postojeći `send-daily-summary` cron koji već prolazi po userima).
- **Bez AI formulacije** — sve poruke su templateirane. AI sloj se može dodati kasnije kao opcionalna obogaćivanja (`enriched_message` polje).
- **Bez brisanja** `generate-ai-insights` edge / `ai_insights_cache` — ostaju dok ne validiramo da novi sustav radi.

---

## 7. Test plan

Vitest:
- `issueDetection.test.ts` — svaka detektor funkcija, edge caseovi (nema podataka, granične vrijednosti marže, datumi).
- Reconciler logika ekstrahirana u pure funkciju `reconcileIssues(active, detected) → {toInsert, toTouch, toResolve}` → unit testovi.

Manualno:
- Kreiraj projekt s maržom < 10% → issue se pojavi.
- Promijeni `contract_value` da marža naraste > 10% → issue auto-resolve.
- Dismiss issue → nestaje, ne vraća se na sljedeći reload (dok ne resolved + ponovo detected).

---

## 8. Redoslijed implementacije

1. Migracija notifications (status, severity, dedup_key, entity_*, *_at, last_seen_at, indeksi, RPCs)
2. `issueDetection.ts` helpers + vitest
3. `useIssueReconciler.ts` + `useActiveIssues.ts`
4. Refactor `AIInsightsSection` → `ActiveIssuesSection` (rename file, swap data source, dodaj Dismiss)
5. i18n keyovi (HR/EN/DE)
6. Deprecate `useProjectLossZoneAlert` (alert se sad generira kroz reconciler)
7. Update memory: nova `mem://features/active-issues-system` + ažuriraj `ai-insights-dashboard` (status: superseded)

---

## Tehnički detalji

**Dedup key format:** `<detector_type>:<entity_id>` (npr. `project_loss_zone:abc-123`, `overdue_invoice:inv-456`). UNIQUE samo za `status='active'` → nakon resolve može se ponovno kreirati nova ako problem opet nastupi.

**Reconciler trigger:** mount `Index.tsx` + invalidacija `useExpenseFetch` / `useProjects` queryja. Throttle: ne pokretati češće od 30s (lokalni ref).

**Severity mapping detektora:**
- `project_loss_zone`: critical ako margin < 0%, warning ako 0–10%
- `overdue_invoice`: warning > 7 dana, critical > 30 dana
- `budget_burn`: warning > 85%, critical > 100%
- `cashflow_risk`: warning ako 30d projekcija < 0
