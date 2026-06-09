---
name: Unified Notification Navigation & Highlight
description: Jedinstveni tab-aware sustav za bell click i native push tap — payload + route + initialTab + DOM highlight pulse
type: feature
---

# Cilj
Klik na obavijest u zvonu I tap na native push otvore istu rutu, **ispravan tab** ciljane surface (projekt) i highlightaju ciljani DOM element ~2s. Legacy obavijesti bez `route` rade kroz `legacyResolve`.

# Arhitektura

1. **`src/lib/notificationPayload.ts`** — `normalizePayload(type, data)` vraća `{type, route, fallback_route, highlight: {type, id, tab?} | null}`. Podržava 3 oblika: standardizirani `route` + nested `highlight` (s opcionalnim `tab`), FCM flat `highlight_type`/`highlight_id`/`highlight_tab`, legacy ID polja. `legacyResolve` deterministički setira `tab`: milestone→`phases`, invoice→`funding`, project_transaction→`transactions`, project_activity/note→`activity`, project_loss/cashflow→`overview`.

2. **`src/lib/pendingHighlight.ts`** — sessionStorage + in-memory fallback. **TTL 30s** za project/milestone/invoice/expense (cold start može biti spor), **10s** za ostalo. Sprema `{ type, id, tab, route, expiresAt }`. Memory je nužan za native cold start prije nego što WebView završi boot.

3. **`src/hooks/useNotificationNavigation.ts`** — `navigateFromNotification(type, data)`. Za rute koje počinju s `/projects` koristi `navigate('/projects', { state: { openProjectId, initialTab, openExpenseId } })` jer `ProjectsPanel` ne čita query param `?id=`. Sve ostalo (`/budgets`, `/wallet`, `/calendar`, `/install`) ide preko običnog `navigate(route)`.

4. **`src/components/projects/ProjectsPanel.tsx`** — `useEffect` na `location.state` otvara `ProjectFullScreenView` i pamti `pendingInitialTab` koji se prosljeđuje kao `initialTab` prop. Fallback za **native cold start**: ako `state` ne postoji, čita `peekPendingHighlight()` (ne consume — to ostaje na `HighlightTarget`) i izvuče projectId iz `pending.route`.

5. **`src/components/HighlightTarget.tsx`** — globalni listener mountan u `RouteAwareGlobalOverlays`. Traži `[data-highlight-id="<type>:<id>"]` (s fallbackom na čisti `<id>`), pulse 2s + scroll. Timeout 8s → toast. **Iznimka: `pending.type === 'reminder'`** odmah `clearPendingHighlight()` bez timeouta i bez toasta (kalendarski grid nema realan marker).

# Pokriveni tipovi (12)
project_transaction, note_added/project_note_added, project_activity/project_member_joined, milestone_deadline, milestone_budget, overdue_invoice, project_loss_zone, cashflow_risk, budget_alert/budget_burn, payment_source_transaction, pending_transaction/pending_auto_rejected, reminder/calendar_event, app_update, broadcast.

# UI markeri (`data-highlight-id`)
- `expense:<id>` — `TransactionItem.tsx`
- `milestone:<id>` — `ProjectMilestonesTab.tsx`
- `invoice:<id>` — `ProjectInvoicesPanel.tsx`
- `budget:<id>` — `BudgetCard.tsx`
- `project:<id>` — `ProjectCard.tsx` (compact + full)

Pending transactions: koriste TransactionItem (`expense:<id>`). Reminders: nemaju marker — graceful skip u `HighlightTarget`.

# Native push (cold start)
`nativePush.ts` `pushNotificationActionPerformed` zove `normalizePayload`, `setPendingHighlight` PRIJE `window.location.replace(route)`. Na cold mount `ProjectsPanel` pročita pending za projekt+tab, `HighlightTarget` izvrši pulse i finalno `clearPendingHighlight()`.

# Bell flow
`NotificationsDropdown.handleNotificationClick` koristi `navigateFromNotification`. Invitation/`ai-assistant:ask` slučajevi ostaju netaknuti.

# Pokriveno i za 19h batch
- `participant_digest` (iz `flush-participant-digest`) sada šalje `route=/projects?id=<id>`, `highlight_type=project`, `highlight_tab=activity` u FCM `data`. Ista stavka se piše u `notifications` tablicu s `dedup_key=digest:<projectId>:<YYYY-MM-DD>` da bell klik radi identično push tap-u. `legacyResolve` ima backup case.

# Ograničenja
- Ostale edge funkcije još NE šalju nove `route`/`highlight_*` fieldove. Legacy resolver pokriva sve preko ID polja + tipa.
- Reminder/calendar event = bez highlightа (samo otvori `/calendar`).
- BudgetDetailView mountanje preko `?id=`: ako se ne otvori automatski, highlight padne na toast nakon 8s.

# Test
`src/lib/__tests__/notificationPayload.test.ts` — 18 testova, uključujući tab mapping za milestone/invoice/transaction/activity/note/loss_zone i nested+flat tab payload.
