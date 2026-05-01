---
name: Timeclock module removed
description: Šihterica (TimeClock) modul i tablica time_clock_entries uklonjeni — evidencija sati ide isključivo kroz Dnevnik rada
type: constraint
---
Šihterica modul je uklonjen jer aplikacija nije službeni alat za knjigovodstvo. Sva evidencija radnih sati ide kroz Dnevnik rada (`project_work_logs` → trigger sync → `project_work_entries`). NE vraćati `time_clock_entries` tablicu, `useTimeClock` hook, `src/components/timeclock/` direktorij. **Why:** duplikacija s dnevnikom, friction za radnike, NN 55/2024 usklađenost nije potrebna za internu upotrebu. Backup 4 zapisa na /mnt/documents/time_clock_entries_backup.csv.
