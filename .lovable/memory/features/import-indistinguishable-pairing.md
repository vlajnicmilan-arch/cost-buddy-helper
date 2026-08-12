---
name: Automatsko uparivanje nerazlučivih kandidata + opis u odluci o spajanju
description: importClassifier faza 1.5 (1:1 par nerazlučivih kandidata) i faza 3 na deriveComparableName; ograda (c) svjesno ukinuta
type: feature
---

**Korisnikova svjesna izmjena ranije ograde (c)** ("nikad automatski kod više kandidata") — ukinuta 12.8.2026 jer je pokrivala baš sve slučajeve naknada.

**Faza 3 (`src/lib/importClassifier.ts`)** koristi `deriveComparableName` (merchantName → description) + `areMerchantsSimilar` na OBJE strane. Opis sada MOŽE odlučiti o autoMergeu (npr. „Naknada za paket" u opisu s obje strane). Ako ijedna strana nema izvedeno ime sa značajnom riječi → `no_merchant` pitanje.

**Faza 1.5 — nerazlučivi kandidati:** grupiranje po `sourceKey|type|amount(2dp)`; skupina se pari 1:1 SAMO ako svi redci i svi kandidati imaju izvedena imena sa značajnom riječi i SVI parovi imena su međusobno slični. Jedan nesličan par (Kristina Cerina vs Ana Milanovic) gasi cijelu skupinu. Datumski prozor = `maxDayDiff` (1). Deterministički poredak: datum → index/id. Nijedan kandidat dvaput; iskorišteni ispadaju iz ostalih skupova.

`AutoMergePair.origin: 'merchant' | 'indistinguishable'`; `ClassificationKind.auto_merge.origin` isto.

**UI:** oznaka „Automatski upareno — nerazlučivi kandidati" + tipka „Razdvoji" (`importReview.indistinguishable.*`). Razdvoji = `autoMerge=false` + `newRows=true` → executor umeće redak kao novi (inače preskače). Ništa ne ulazi u knjige do „Potvrdi uvoz".

Testovi: `src/lib/importReview/__tests__/indistinguishablePairing.test.ts`.
