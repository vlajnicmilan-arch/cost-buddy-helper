## Cilj

1. **Sada**: spojiti 2 bank_only retka iz Vinkinog zadnjeg uvoza s postojećim manual unosima (umjesto da postoje kao paralelni duplikati).
2. **Ubuduće**: u dijalogu duplikata svaki "možda" / "sumnjivi" redak dobiva 3 jasna gumba — **Spoji s postojećom** / **Uvezi kao novu** / **Preskoči** — da se ne ponovi greška.

---

## Dio 1 — Retroaktivno spajanje (jednokratno, preko data migration)

Cilj: stanje mora izgledati identično kao da je autoMerge to napravio tijekom uvoza.

Za svaki od 2 para:
- Manual redak (zadržava se): postaje `bank_match_status = 'confirmed'`, dobiva `import_batch_id = '985b800a-…'` i `bank_transaction_id` od bank_only retka.
- Bank_only redak: hard delete (NE soft, jer je nikad nije trebao ni postojati; balans nije diran prilikom uvoza).

Parovi:
- 20.04. 40 € — manual `7b21b2d9` (Cabaret LEVEL / Entrio) ← bank `832df526` (ENTRIO WEB)
- 19.04. 0,80 € — manual `4f1c692e` (Parking Prima 3) ← bank `97148f4b` (SPLIT PARKING)

Sigurnosne provjere prije izvršavanja:
- Potvrditi da bank_only retci nisu utjecali na saldo (`expense_nature ≠ 'correction'` i da `useBalanceUpdater` nije aplicirao — provjeriti `payment_source` i da nema `balance_applied` flaga).
- Ako bilo koji manual već ima `import_batch_id ≠ NULL`, prekinuti (znak da je već nešto drugo).

---

## Dio 2 — 3-gumba UX (`GlobalPDFImportHost.tsx`)

### Promjena modela odluke

Trenutno: `selectedFuzzy: Set<number>` i `selectedSuspicious: Set<number>` — checkbox = "uvezi kao novu", inače = preskoči. **Nema opcije spojiti.**

Novo: po retku jedna od 3 vrijednosti:
```
type RowDecision = 'merge' | 'new' | 'skip';
```
Default: `'skip'` (najsigurnije — bez odluke ne ulazi ništa).

State:
```
fuzzyDecisions: Map<number, RowDecision>
suspiciousDecisions: Map<number, RowDecision>
```

### UI po retku

Umjesto cijelog retka kao checkbox-tile, svaki redak ima:
- Gornji segment: postojeća transakcija (kao i sad).
- Donji segment: nova s izvoda (kao i sad).
- Ispod: 3 segmentirana gumba (ToggleGroup, single-select):
  - **Spoji** (ikona `Link2`, teal kad je aktivna) — zelena emerald obrubljena kartica
  - **Nova** (ikona `Plus`, amber kad je aktivna)
  - **Preskoči** (ikona `X`, sivo, default)

Touch target min 44px, fits 384px breakpoint (3 gumba × ~110px = stane). Na uskim ekranima ToggleGroup wrap-a u 2 reda po potrebi.

### Promjena u `handleImportDuplicates`

```
const fuzzyMergeTxs   = fuzzyDuplicates.filter(merge);
const fuzzyNewTxs     = fuzzyDuplicates.filter(new);
const suspiciousMergeTxs = suspiciousDuplicates.filter(merge);
const suspiciousNewTxs   = suspiciousDuplicates.filter(new);

// "Nove" → ide kroz isti put kao do sad (transactions array → _runImport).
// "Spoji" → novi put: pošalji parove (tx + matchedExpense.id) u dedicated helper koji:
//   - update manual: bank_match_status='confirmed', import_batch_id=batch, bank_transaction_id=tx.bank_transaction_id (ili sintetski hash ako ga PDF nema)
//   - NE inserta novi expense red
//   - NE dira balans
```

Dodaje se novi handler u `PdfImportContext` / `usePDFParser`:
```
type ManualMergeRequest = { manualId: string; tx: ParsedTransaction };
onMergeIntoExisting: (requests: ManualMergeRequest[]) => Promise<void>;
```
Implementacija reuse-a istu DB logiku koju koristi `autoMerge` u postojećem importu (vjerojatno postoji u hooku gdje se obrađuje `autoMergeMatches` — iskoristit točno isti kod, ekstraktiramo u helper `applyManualBankMerge(manualId, tx, batchId)`).

### "Strict duplicates" sekcija — ostaje skoro ista

Strict (isti dan + isti iznos + isti opis) i dalje samo: preskoči (default) ili "uvezi svejedno" (rijetko). NE treba im opcija Spoji jer to autoMerge već radi za njih.

### Auto-merge sekcija — ostaje

Već je 100% automatska, samo informativna.

### Brojač gumba "Uvezi N"

```
unique + autoMerge + fuzzyNew + suspiciousNew + fuzzyMerge + suspiciousMerge + (strict ako tick)
```
Tekst gumba ostaje `import.importCount`; ali možda dodati subline "X spojeno · Y novih" — odluka u izvedbi.

---

## Dio 3 — i18n

Novi ključevi u `hr.json` / `en.json` / `de.json` pod `import.duplicateDecision.*`:
- `merge` / `mergeHint` ("Spoji s postojećom — banka potvrđuje tvoj unos")
- `new` / `newHint` ("Uvezi kao zasebnu — različita transakcija")
- `skip` / `skipHint` ("Preskoči — ignoriraj ovu stavku iz izvoda")

---

## Dio 4 — Tehnički detalji

**Datoteke:**
- `src/components/pdf-import/GlobalPDFImportHost.tsx` — UI + decision state
- `src/contexts/PdfImportContext.tsx` — dodati `_runMergeIntoExisting`
- `src/hooks/useExpenseFetch.ts` ili gdje god je trenutni autoMerge writer — ekstrakt helpera `applyManualBankMerge`
- `src/i18n/locales/{hr,en,de}.json` — 6 novih ključeva
- (eventualno) novi vitest test za `applyManualBankMerge` decision flow

**Što ne dirati:**
- `duplicateDetection.ts` (klasifikacija je ispravna)
- `manualMatchForImport.ts` (autoMerge logika)
- `parse-pdf-statement` edge funkcija
- Saldo / `useBalanceUpdater` (merge ne dira balans)

**Native:** nema native promjena → bez version bumpa.

**Test:** vitest za `applyManualBankMerge` (1 par → manual postaje confirmed + dobiva oba ID-a, bank_only se ne kreira).

---

## Redoslijed izvršavanja

1. Najprije Dio 1 (data migration / supabase--insert s SQL UPDATE + DELETE za 2 para) — pa potvrda da Vinka vidi spojeno stanje.
2. Zatim Dio 2/3/4 (UI promjena za ubuduće).
