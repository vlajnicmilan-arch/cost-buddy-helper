## Problem

Notifikacija u zvonu prikazuje sirove i18n ključeve:

```
attention.issues.budgetBurn.title
attention.issues.budgetBurn.message
```

## Uzrok (verificirano)

- `useIssueReconciler` poziva RPC `upsert_active_issue` i u `notifications.title`/`message` sprema **i18n ključeve** (`attention.issues.budgetBurn.title`), a varijable u `data.title_vars` / `data.message_vars` (vidi `src/lib/issueDetection.ts` 162‑173 i `src/hooks/useIssueReconciler.ts` 71‑84).
- Ključevi postoje u `src/i18n/locales/hr.json|en.json|de.json` pod `attention.issues.*`.
- `NotificationsDropdown.tsx` (linije 356, 359) renderira `notification.title` / `notification.message` **sirovo**, bez `t()` — pa korisnik vidi ključ.
- Druge notifikacije (npr. `milestone_deadline`) imaju već-prevedeni tekst spremljen u DB iz edge funkcije, pa su izgledale ispravno i problem je ostao nezamijećen.

## Rješenje

Render-time lokalizacija u `NotificationsDropdown.tsx`. Ne diramo DB ni reconciler — strategija "sprema ključ, prevedi pri prikazu" je ispravna jer prati promjenu jezika korisnika bez backfilla.

### Koraci

1. **Helper** `src/lib/notificationI18n.ts`:
   - `resolveNotificationText(raw: string | null, vars: Record<string, unknown> | undefined, t): string`
   - Ako `raw` izgleda kao i18n ključ (regex `^[a-zA-Z][\w]*(\.[\w]+)+$` i `i18n.exists(raw)`), vrati `t(raw, vars)`.
   - Inače vrati `raw` nepromijenjeno (back-compat za `milestone_deadline` itd.).
   - Vars dolaze iz `notification.data.title_vars` / `notification.data.message_vars`.

2. **NotificationsDropdown.tsx**:
   - Linija 356: `{resolveNotificationText(notification.title, notification.data?.title_vars, t)}`
   - Linija 359: `{resolveNotificationText(notification.message, notification.data?.message_vars, t)}`
   - Linija 337 (`aria-label`) i 418/420 (AlertDialog za pozivnicu) — isto.

3. **Backfill postojećih redova** — preskačemo. Postojeća budget_burn obavijest će se sama resolveati pri sljedećem renderu jer ključevi postoje. Korisnik može obrisati staru i nova će biti odmah ispravna.

### Što ne dirati

- `useIssueReconciler`, `issueDetection.ts`, RPC `upsert_active_issue`, DB shema, edge funkcije, ostali tipovi notifikacija.

## Validacija

- Otvoriti zvono → budget_burn obavijest prikazuje "Budžet … pri kraju" / "Iskorišteno X%".
- Promijeniti jezik (EN/DE) → tekst se mijenja bez novog DB upisa.
- `milestone_deadline` i `family_message` ostaju nepromijenjeni.
