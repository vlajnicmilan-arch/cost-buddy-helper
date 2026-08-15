---
name: Brief-vrata V1
description: Pozdravni ekran s istinama prije ulaska — flag, RPC brief_gate_snapshot, pravilo učestalosti i tišine
type: feature
---

Vrata = lazy ekran `/brief`, ulazi se preko `getAppEntryRoute` (samo kad bi inače išlo na `/home`).

Tri brave:
1. Build flag `BRIEF_GATE_ENABLED` u `src/lib/featureFlags.ts` (kill switch).
2. Po-korisnički popis: `app_settings.key='brief_gate_user_ids'` (jsonb array user id-jeva). RPC `brief_gate_snapshot()` vraća `{enabled:false}` svima izvan popisa.
3. Korisnikov prekidač u Postavke → Napredno (`localStorage vmb-brief-gate:disabled:v1`).

Pravila (u `src/lib/briefGate.ts`, testovi `src/lib/__tests__/briefGate.test.ts`):
- Učestalost: prvi ulazak u lokalnom danu ILI ≥4 h od zadnjeg prikaza (`vmb-brief-gate:last-shown:v1`).
- Tišina: nijedna istina (računi u dospijeću, dokumenti na pregledu, „Za pažnju", uvozna skica) → vrata se ne prikazuju.
- Fail-open: nema instantCache snimke i RPC ne stigne u 400 ms → ravno `/home`. Vrata NEMAJU loading state. `BriefGateBoundary` hvata svaki kvar → `/home`.

Ekran prefetcha Home chunk (`import('./pages/Index')`).
V1 opseg zaključan: samo 4 postojeće istine, nula novih izračuna.
