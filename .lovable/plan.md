

## Implementacija voice input gumba

Korisnik je već odobrio plan u prethodnoj poruci. Ponavljam ga sažeto za potvrdu prelaska u default mod.

## Što gradim

**1. Novi hook** `src/hooks/useVoiceDictation.ts`
- Centralizirana logika: native (`@capacitor-community/speech-recognition`) + web (`webkitSpeechRecognition`)
- Permission handling, auto-restart, locale prati `i18n.language`
- Vraća: `{ recording, start, stop, supported, showPermissionHelp, setShowPermissionHelp }`

**2. Nova komponenta** `src/components/VoiceInputButton.tsx`
- Props: `value`, `onChange`, `disabled?`, `className?`
- Mic ikona, 44px touch target, pulsirajuća crvena točka tijekom snimanja
- Smart spacing — dodaje razmak između postojećeg teksta i transkripta
- Sakriven ako `supported === false`
- Ugrađeni `AlertDialog` za permission help

**3. i18n ključevi** u `hr.json` / `en.json` / `de.json`:
`voice.start`, `voice.stop`, `voice.recording`, `voice.notSupported`, `voice.permissionTitle`, `voice.permissionBody`

**4. Integracije** (wrap textarea u `relative` div + gumb `absolute bottom-2 right-2`):

| # | Datoteka | Polje |
|---|---|---|
| 1 | `EditTransactionDialog.tsx` | Opis transakcije |
| 2 | `add-expense/ManualExpenseForm.tsx` | Opis transakcije |
| 3 | `TransactionNotesThread.tsx` | Nova bilješka |
| 4 | `projects/ProjectDialog.tsx` | Opis projekta |
| 5 | `projects/ProjectMilestonesTab.tsx` | Opis faze |
| 6 | `projects/EstimateDialog.tsx` | Opis stavke |
| 7 | `projects/WorkCalendarOverview.tsx` | Napomene radnika |
| 8 | `budget/BudgetDialog.tsx` | Opis budžeta |
| 9 | `calendar/CalendarEventDialog.tsx` | Opis događaja |
| 10 | `timeclock/TimeClockAbsenceDialog.tsx` | Bilješka |
| 11 | `timeclock/TimeClockQuickEntryDialog.tsx` | Bilješka |
| 12 | `custom-payment-sources/CustomPaymentSourceDialog.tsx` | Opis računa |
| 13 | `BugReportDialog.tsx` | Opis problema |

**5. Refactor** `DailyStandupSheet.tsx` — koristi novi hook (UX nepromijenjen)

## Što NE diram
Bazu, RLS, Edge funkcije, Capacitor config, logiku spremanja, kratke inpute (naslov, iznos, datum).

## Native build
**Nije potreban novi APK** — plugin već zapakiran, sve ide kroz Live Sync.

