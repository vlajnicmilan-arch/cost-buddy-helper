---
name: Unified Notification Navigation & Highlight
description: Jedinstveni sustav za bell click i native push tap — payload + route + DOM highlight pulse
type: feature
---

# Cilj
Klik na obavijest u zvonu I tap na native push otvore istu rutu i highlightaju isti DOM element ~2s. Legacy obavijesti bez `route` rade kroz `legacyResolve`.

# Arhitektura (4 sloja)

1. **`src/lib/notificationPayload.ts`** — `normalizePayload(type, data)` vraća `{type, route, fallback_route, highlight: {type,id}|null}`. Podržava 3 oblika podataka: standardizirani `route` + nested `highlight`, FCM flat `highlight_type`/`highlight_id`, legacy ID polja (`project_id`, `expense_id`, `milestone_id`, `invoice_id`, `budget_id`, `payment_source_id`, `reminder_id`, `note_id`).

2. **`src/lib/pendingHighlight.ts`** — sessionStorage `pendingHighlight` + in-memory fallback (10s TTL). Memory je nužan za native cold start prije nego što WebView završi boot.

3. **`src/hooks/useNotificationNavigation.ts`** — `navigateFromNotification(type, data)` koji koristi React Router `navigate()`. Zove se iz `NotificationsDropdown.handleNotificationClick`. Ako nema route ni highlight, prikaže toast `notifications.itemNotAvailable`.

4. **`src/components/HighlightTarget.tsx`** — globalni listener mountan u `RouteAwareGlobalOverlays` (App.tsx). Na svakoj promjeni rute traži `[data-highlight-id="<type>:<id>"]` (s fallbackom na čisti `<id>`), dodaje klasu `highlight-pulse` (CSS `@keyframes notification-highlight-pulse` u index.css) i scroll. Timeout 8s → toast "Stavka više nije dostupna".

# Pokriveni tipovi (12)
project_transaction, note_added, project_activity, project_member_joined, milestone_deadline, milestone_budget, overdue_invoice, project_loss_zone, cashflow_risk, budget_alert, budget_burn, payment_source_transaction, pending_transaction, pending_auto_rejected, reminder, calendar_event, app_update, project_note_added, broadcast.

# UI markeri (`data-highlight-id`)
- `expense:<id>` — `TransactionItem.tsx` (line ~183)
- `milestone:<id>` — `ProjectMilestonesTab.tsx` (line ~348)
- `invoice:<id>` — `ProjectInvoicesPanel.tsx` (line ~133)
- `budget:<id>` — `BudgetCard.tsx` (line ~116)
- `project:<id>` — `ProjectCard.tsx` (oba branchа: compact i full)

Pending transactions: koriste TransactionItem (`expense:ID`), HighlightTarget fallback radi i sa čisti id.

Reminders: nema dedicirane komponente — fallback na rutu `/calendar` (highlight no-op + toast nakon 8s).

# Native push (cold start)
`nativePush.ts` `pushNotificationActionPerformed` zove `normalizePayload`, postavlja `setPendingHighlight` ODMAH (prije nego što WebView mountira React), pa `window.location.replace(route)`. HighlightTarget na mount pročita pending iz memory ako sessionStorage još nije inicijaliziran.

# Bell flow
`NotificationsDropdown.handleNotificationClick` više ne sadrži `getNavigationTarget` switch. Invitation/`ai-assistant:ask` slučajevi (overdue_invoice/cashflow_risk bez podataka) ostaju netaknuti.

# Ograničenja
- Edge funkcije (`notify-*`, `check-*`) još NE šalju nove `route`/`highlight` fieldove. Legacy resolver pokriva sve, ali kad lista nije lazy-mountana (npr. milestone tab nije aktivan), MutationObserver će čekati do 8s pa pasti na toast.
- Reminder UI nema marker (calendar implementacija).
- BudgetCard: ako se BudgetDetailView ne otvori automatski na ?id=, highlight će puknuti — pokriveno toast porukom.

# Test
`src/lib/__tests__/notificationPayload.test.ts` — 12 testova: standardizirani DB payload, FCM flat, svi legacy tipovi, unknown type, type iz data polja.
