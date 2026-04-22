

## Mikrofon u projektima — provjereno stanje + dopuna

### Provjereno (iz koda) — gdje mikrofon VEĆ POSTOJI

| Lokacija | Polje |
|---|---|
| `ProjectDialog.tsx` | Opis projekta |
| `ProjectMilestonesTab.tsx` | Opis faze |
| `EstimateDialog.tsx` | Opis stavke ponude + Napomene |
| `WorkCalendarOverview.tsx` | Bilješka u kalendaru rada (3 mjesta) |
| `DailyStandupSheet.tsx` | Već koristi vlastiti diktat (zaseban widget) |

### Provjereno — gdje mikrofona NEMA (a ima Textarea polje)

| Datoteka | Polje | Linija |
|---|---|---|
| `ProjectCollaboratorDialog.tsx` | Opis usluge | 117 |
| `ProjectCollaboratorDialog.tsx` | Napomena | 168 |
| `WorkerScheduleDialog.tsx` | Napomena rasporeda radnika | 376 |

### Što ću napraviti

Dodati `<VoiceInputButton>` na sva 3 polja iznad, koristeći postojeći obrazac (`relative` wrapper + `pr-12` padding + `absolute bottom-2 right-2`).

### Tehničke izmjene

| Datoteka | Promjena |
|---|---|
| `src/components/projects/ProjectCollaboratorDialog.tsx` | Import `VoiceInputButton`, omotati 2 Textarea polja u `relative` div, dodati gumb |
| `src/components/projects/WorkerScheduleDialog.tsx` | Import `VoiceInputButton`, omotati Textarea, dodati gumb |

### Što se NE mijenja

- Komponenta `VoiceInputButton` i hook `useVoiceDictation` (već postoje, već se koriste)
- Logika spremanja, validacija, RLS
- Ostali tabovi i dijalozi
- Bundle size (komponenta je već uključena)

### Očekivani ishod

- U dijalogu **Suradnik** (Novi/Uredi) možeš diktirati Opis usluge i Napomenu
- U dijalogu **Raspored radnika** možeš diktirati Napomenu
- Mikrofon se automatski skriva na uređajima koji ga ne podržavaju (iOS Safari, Firefox)
- Bez utjecaja na performanse — komponenta je već učitana

