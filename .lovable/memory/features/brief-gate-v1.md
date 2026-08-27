---
name: Brief-vrata V1 (deterministički briefing)
description: Pozdravni ekran prije Centra — RPC brief_gate_snapshot_v2, deterministički motor (NEIZVJESNOST > DOSPIJEĆE > MAIL > MIRNO), kontinuitet u localStorageu, zastavica default OFF
type: feature
---

Vrata = lazy ekran `/brief`, ulazi se preko `getAppEntryRoute` (samo umjesto `/home`), poslije auth/onboarding provjera.

Tri brave (ne pregovara se):
1. Build flag `BRIEF_GATE_ENABLED` u `src/lib/featureFlags.ts` — **default `false`**.
2. Po-korisnički popis: `app_settings.key='brief_gate_user_ids'` (jsonb array). `'["*"]'` = svi prijavljeni; prazan popis ili nema retka = nitko; pojedinačni identifikatori = samo oni. Popis je operativna postavka, migracije ga NE diraju. RPC vraća `{enabled:false}` svima izvan popisa.
3. Korisnikov prekidač u Postavke → Napredno (`localStorage vmb-brief-gate:disabled:v1`).

Izvor činjenica: JEDAN read-only RPC `brief_gate_snapshot_v2()` (SECURITY DEFINER, EXECUTE samo `authenticated`).
Kategorije: `uncertainty` (document_ingest_items `na_pregledu`), `due` (incoming_invoices, neplaćeni, dospijeće ≤ +7 dana), `mail` (mail dokumenti `povezan`, 7 dana). Svaka vraća `count`, `watermark`, `filter` (dokaziva destinacija).

Motor `src/lib/brief/engine.ts` — NULA AI:
- Fiksni prioritet NEIZVJESNOST > DOSPIJEĆE > MAIL, max 3 poruke; MIRNO je isključivo fallback.
- Stanja: NEW / REMINDER / UNCHANGED / RESOLVED. **Watermark ima prednost pred brojem.**
- Nema `filter` → nema poruke. RESOLVED se prikazuje samo ako je prije stvarno nešto stajalo. MAIL se javlja samo kao NEW.
- Registar budućih kategorija (`liquidity`, `projectBudget`) postoji u `types.ts`, ali NIJE u prioritetu — ne izvršava se.

Kontinuitet: `src/lib/brief/continuity.ts`, ključ `vmb-brief-gate:continuity:v1`. Zapis se ažurira TEK kad su vrata stvarno prikazana.

Fail-open: tvrdi rok 400 ms (`useBriefSnapshot`), `BriefGateBoundary`, svaka greška/istek → `/home`. Ekran nema loading state ni automatski prijelaz.

Testovi: `src/test/brief/briefEngine.test.ts`, `src/test/brief/briefScreen.test.tsx`, `src/lib/__tests__/briefGate.test.ts`.
