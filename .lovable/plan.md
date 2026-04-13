

# Audit: Mobile Responsiveness problemi (360px ekrani)

## Pronađeni problemi po kategorijama

### 1. Premali touch targeti (ispod 44px minimuma)

| Datoteka | Problem | Trenutno |
|---|---|---|
| `WorkCalendarOverview.tsx` (L820,823) | Edit/Delete gumbi | `h-7 w-7` (28px) |
| `BusinessDebtTracker.tsx` (L215,218,238) | Označi plaćeno / Obriši | `h-7 w-7` (28px) |
| `BusinessProfileDialog.tsx` (L511) | Back gumb | `h-7 w-7` (28px) |
| `NotificationsDropdown.tsx` (L272,284) | Dismiss/Delete | `h-6 w-6` (24px) |
| `BackupRestore.tsx` (L288,299,535,548) | Restore/Delete/Settings | `h-8 w-8` (32px) |
| `BudgetMembersTab.tsx` (L258,298) | Remove member | `h-8 w-8` (32px) |
| `ReportsDialog.tsx` (L1111,1119,1135,1143) | Income toggle tipke | `h-7 px-2/3` (28px) |
| `settings/ProfileSection.tsx` (L48) | Edit name | `h-8 w-8` (32px) |

**Ukupno: ~20 gumba na 8 datoteka**

### 2. Fiksni margini koji kradu prostor na 360px

| Datoteka | Problem |
|---|---|
| `ReportsDialog.tsx` (L1009) | `ml-5` na "Nema transakcija" tekstu |
| `ManualExpenseForm.tsx` (L686) | `ml-6` na hint tekstu |
| `ScannedDataPreview.tsx` (L576) | `ml-6` na hint tekstu |
| `LoanDetectionDialog.tsx` (L109) | `ml-6` na formi unutar expandera |

### 3. Tekst koji se može odrezati (nedostaje `truncate` ili `min-w-0`)

| Datoteka | Problem |
|---|---|
| `LoanDetectionDialog.tsx` (L92-101) | Badge-ovi s tekstom u flex redu — nema wrapa, odu van ekrana |
| `CategoryTransactionsDialog.tsx` (L298) | Payment info tekst nema `truncate` |
| `BudgetFullScreenView.tsx` (L217) | `grid-cols-4` TabsList — na 360px 4 taba se zgušnjaju |
| `BusinessDashboard.tsx` (L73,85) | "vs prošli mj." tekst uz postotke — može se odrezati |

### 4. Dijalozi bez mobile-optimizirane širine

| Datoteka | Problem |
|---|---|
| `CustomCategoryDialog.tsx` | `max-w-md` bez `w-[calc(100vw-1rem)]` |
| `TimeClockQuickEntryDialog.tsx` | `max-w-md` bez responsive width |
| `ProjectBudgetHistoryDialog.tsx` | `max-w-md` bez responsive width |
| `ProjectCollaboratorDialog.tsx` | `max-w-md` bez responsive width |
| `TimeClockAbsenceDialog.tsx` | `max-w-md` bez responsive width |

### 5. `text-[9px]` i `text-[10px]` — na granici čitljivosti

| Datoteka | Koliko mjesta |
|---|---|
| `LoanDetectionDialog.tsx` | 5 mjesta (badges + labele) |
| `BusinessDashboard.tsx` | 4 mjesta |
| `BusinessMore.tsx` | 1 mjesto |
| `BusinessModuleSettings.tsx` | 1 mjesto |
| `CategoryBreakdown.tsx` | 1 mjesto |

---

## Plan popravka

### Korak 1: Touch targeti → min 44px (8 datoteka)
Dodati `min-h-[44px] min-w-[44px]` na sve gumbe koji su ispod 44px. Ne mijenjati vizualnu veličinu ikone, samo povećati hit area.

### Korak 2: Fiksni margini → manji (4 datoteke)
- `ml-6` → `ml-4`
- `ml-5` → `ml-3`

### Korak 3: Dijalozi → responsive širina (5 datoteka)
Dodati `w-[calc(100vw-1rem)] sm:w-auto` na `DialogContent` koji koriste samo `max-w-md`.

### Korak 4: Overflow zaštita (3 datoteke)
- `LoanDetectionDialog.tsx`: dodati `flex-wrap` na badge kontejner
- `CategoryTransactionsDialog.tsx`: dodati `truncate` na payment info
- `BudgetFullScreenView.tsx`: tab tekst već ima `hidden sm:inline` — OK

### Korak 5: Income sekcija ReportsDialog (1 datoteka)
Primijeniti isti `min-h-[44px]` popravak na income toggle tipke (L1111-1143) kao što je već napravljeno za expense toggle.

---

## Datoteke za promjenu (ukupno ~13)

1. `src/components/projects/WorkCalendarOverview.tsx`
2. `src/components/business/BusinessDebtTracker.tsx`
3. `src/components/BusinessProfileDialog.tsx`
4. `src/components/NotificationsDropdown.tsx`
5. `src/components/BackupRestore.tsx`
6. `src/components/budget/BudgetMembersTab.tsx`
7. `src/components/reports/ReportsDialog.tsx`
8. `src/components/settings/ProfileSection.tsx`
9. `src/components/add-expense/ManualExpenseForm.tsx`
10. `src/components/add-expense/ScannedDataPreview.tsx`
11. `src/components/business/LoanDetectionDialog.tsx`
12. `src/components/CategoryTransactionsDialog.tsx`
13. `src/components/timeclock/TimeClockAbsenceDialog.tsx` + ostali dijalozi (batch)

Nema promjena baze, migracija ni RLS-a.

