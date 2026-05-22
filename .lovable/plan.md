Plan:

1. Popraviti prijevod u dropdownu obavijesti
- Problem nije u prijevodima: HR ključ postoji i zadnji red u bazi ima `title = attention.issues.budgetBurn.title` i `data.title_vars.budgetName`.
- Problem je što se u JSX-u čita `notification.data` direktno, a kod već ima parser `parseNotificationData()` jer `data` nekad može biti string.
- U listi obavijesti izračunat ću `notificationData = parseNotificationData(notification.data)` i svuda koristiti njega za `title_vars` i `message_vars`.

2. Popraviti klik na AI/issue obavijest
- Trenutno `getNavigationTarget()` nema slučajeve za `budget_burn`, `project_loss_zone`, `overdue_invoice`, `cashflow_risk`, pa klik samo označi kao pročitano i ne otvara ništa.
- Dodati ponašanje:
  - `budget_burn` → otvori `/budgets` s `openBudgetId`
  - `project_loss_zone` → otvori `/projects` s `openProjectId`
  - `overdue_invoice` i `cashflow_risk` → otvori AI asistenta s prevedenim naslovom + porukom kao početni prompt

3. Ukloniti krhki timeout za AI seed
- U `Index.tsx` trenutno AI prompt koristi `setTimeout(250)`, što je krhko.
- Zamijeniti stabilnijim stanjem za pending prompt: prvo otvoriti dialog, zatim nakon rendera poslati `ai-assistant:seed` kroz `useEffect` kad je dialog stvarno otvoren.

4. Provjera
- Provjeriti da se prikazuje: `Budžet Put u Osijek po radionu pri kraju` i `Iskorišteno 93%`.
- Provjeriti da klik na budget issue vodi na Budžete, a AI fallback otvara AI dialog.