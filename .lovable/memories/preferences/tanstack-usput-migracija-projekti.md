---
name: TanStack Query usput migracija za projekte
description: Kad god značajno diraš neki projektni hook (bez zasebnog PR-a za TanStack), migriraj ga na TanStack Query usput; nikakva zasebna WS4 TanStack prepravka.
type: preference
---
Odluka vlasnika (WS1 kickoff, srpanj 2026):
- WS4 (Realtime + TanStack Query prelazak) IZBAČEN kao zaseban projekt.
- Umjesto toga: kad god značajno diraš neki projektni hook (nova funkcionalnost, refactor, bugfix koji mijenja fetch put), MIGRIRAJ ga na TanStack Query u istom PR-u.
- Standard: `['project', projectId, '<domain>']` query key, `queryClient.invalidateQueries` na relevantnim mutacijama, `staleTime` ~30s (tweak po telemetriji).
- Ne raditi "big bang" konverziju; postupno.
- Realtime subscriptions (postgres_changes) i dalje idu po potrebi, ali ne kao zaseban roadmap milestone.
