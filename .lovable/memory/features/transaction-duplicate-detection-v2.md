---
name: Transaction Duplicate Detection
description: 4-tier scoring s geo stop-words; suspicious pooštren na ±1% iznosa, ±2 dana, ≥2 zajedničke riječi
type: feature
---

Centralni helper `src/lib/duplicateDetection.ts` (4 razine: strict/fuzzy/suspicious/unique).

**Pragovi:**
- `strict` (90–100): exact amount (±0.01) + ±1 dan + merchant match
- `fuzzy` (60–89): exact amount + ±3 dana + merchant match
- `suspicious` (30–59): **±1% iznosa + ±2 dana** + merchant match (pooštreno 24.5.2026)
- `unique` (0–29)

**Korištenje:**
- `findDuplicates` (CSV/PDF, `ignoreSameDayDuplicateGuard: true`) — same-day exact = suspicious umjesto strict
- `checkDuplicate` (manual entry) — same-day exact ostaje strict (anti-dvoklik)

**`normalizeMerchant` — geo stop-words (24.5.2026):**
Strip-aju se HR gradovi i country oznake (split, zagreb, rijeka, osijek, hrv, hrvatska, hr, eur, eu…) prije word-split logike. Sprječava lažne pozitive tipa `LUKOIL POLJUD/SPLIT/HRV` ↔ `LESNINA H PC SPLIT`. **MIRROR**: ista lista u `src/lib/importFingerprint.ts` GEO_STOPWORDS — sinkronizirano.

**`areMerchantsSimilar` — minimum 2 zajedničke riječi:**
Jedna zajednička riječ (≥3 znaka) više nije dovoljna za multi-word merchante. Single-word (LIDL vs LIDL) rade preko `na === nb` / `includes` grane.

**Testovi:** 33 testa u `src/lib/duplicateDetection.test.ts`, uključujući regresijske scenarije (LUKOIL≠LESNINA, SUPETAR≠LIDL, TOMMY ZAGREB≠KONZUM ZAGREB; NETFLIX 1% ostaje suspicious).

Phase B (DB kolone, /review-duplicates, badge) čeka pravu banku.
