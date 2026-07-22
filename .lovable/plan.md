
# Plan: "Poništi ovaj uvoz" (undo cijele serije)

Cilj: jedan gumb koji sigurno poništi cijeli `import_batch_id` — bank_only redovi obrišu, `confirmed` odspoje (korisnikov red ostane netaknut), transferi ponište s obje strane, salda vrati postojeći trigger, `imported_statements` očisti. Nadograđujemo POSTOJEĆI `ImportBatchDialog` — ne gradimo paralelni tok.

## 1. Procjena postojećeg toka (što radi danas)

`ImportBatchDialog` (otvara se iz `PaymentSourceTransactionsDialog`, `TransactionListDialog`, `BusinessTransactions`) danas:
- Prikazuje listu batcha, summary (income/expense), `mergedCount` badge.
- `onDeleteBatch(ids)` handler u call-siteu: RPC `unmerge_import_row` za `confirmed`, `onDelete`/`onBulkDelete` za ostale. Client-side `Promise.allSettled` — **nije atomsko**.
- Confirm dijalog razlikuje merged vs delete count.

### Što mu fali do punog "Poništi uvoz"
a) **Framing**: naslov je "Obriši uvoz" — treba "Poništi ovaj uvoz" + jaka potvrda koja PRIJE klika pokaže: `X novih → briše se`, `Y spojenih → odspaja se (tvoji originali ostaju)`, `Z prijenosa → poništava se obje strane`, ukupan bruto iznos, "salda će se automatski uskladiti".
b) **Transferi**: trenutno se briše samo iz batcha; parna strana (drugi novčanik) je zaseban expense s **istim** `import_batch_id` (executor upisuje oba retka s istim batchem — provjeriti u `executor.ts`; ako nije tako, treba dohvat parne strane po `transfer_group_id`/paru i brisati oba). Salda: postojeći DB trigger na `expenses` recomputes preko engine-a → OK ako se obje strane obrišu.
c) **`imported_statements` cleanup**: batch ima 1 red u `imported_statements` s `reconciliation_state ∈ (aligned, user_override, pending)`. Nakon undo:
   - Preporuka: **soft-mark** `reconciliation_state='undone'`, `reconciliation_meta.undone_at`, ne brisati red (fingerprint dedup nas štiti od dvostrukog uvoza — treba **osloboditi** fingerprint da korisnik može ponovno uvesti isti PDF; opcija: obrisati red iz `imported_statements` u istoj transakciji).
   - **Sidro pitanje** (dizajnersko, tražimo Milanovu odluku): ako je `align_source_to_bank` napravio `bank_reconciliation` sidro tijekom ovog batcha:
     - **Opcija A (default preporuka)**: sidro OSTAJE, banner nakon undo: "Poravnanje salda ostaje aktivno. Ako želiš, vrati na prethodno sidro." + gumb "Vrati prethodno sidro" koji čita `anchor_audit` predzadnji red za taj source.
     - **Opcija B**: automatski revert sidra iz `anchor_audit` unutar iste RPC transakcije (rizik: pregazi ručne korekcije napravljene NAKON align).
     - **Opcija C**: samo upozorenje, nikakva akcija.
d) **Telemetrija**: `funnel_events` event `import_undone` (batch_id, source_id, deleted_count, unmerged_count, transfers_count, had_bank_anchor, age_hours).

## 2. Ulazne točke

- **Batch badge u listi** (postoji): ostaje, otvara isti dijalog.
- **Summary ekran nakon uvoza** (`ImportReview` post-confirm): **DODATI** "Uvezeno X · [Poništi ovaj uvoz]" 5-10s toast + trajni link u Reconciliation dijalogu ("Nešto ne valja? Poništi uvoz"). Trenutno korisnik mora ići u listu novčanika i tražiti badge.
- **Reconciliation resume banner**: ako pending, dodati sekundarni link "Poništi cijeli uvoz umjesto poravnanja".

## 3. Sigurnost i atomicnost

- **Nova RPC `undo_import_batch(p_batch_id uuid)`** — SECURITY DEFINER, u jednoj transakciji:
  1. Validacija: batch postoji, svi redovi pripadaju `auth.uid()` (owner-only, kroz `custom_payment_sources.user_id`); shared/Krug source → provjera je li uvoz radio pozivatelj.
  2. Dohvat svih `expenses` s `import_batch_id = p_batch_id` (i deleted_at IS NULL — soft-deleted preskačemo).
  3. Za svaki `confirmed`: pozvati postojeću `unmerge_import_row` logiku (inline ili funkcija).
  4. Za ostale (`bank_only` + transfer parovi): hard DELETE (ne soft — undo ≠ trash).
  5. `imported_statements`: DELETE red za taj batch (oslobađa fingerprint za ponovni uvoz).
  6. `funnel_events` insert `import_undone`.
  7. Return: `{ deleted, unmerged, transfers, freed_fingerprint }`.
- **Idempotencija**: ako se pozove dvaput → drugi poziv vidi 0 redova → vrati summary `{ already_undone: true }`, ne baca error. Retry-safe.
- **Particijalni fail (mreža)**: cijela RPC je jedna transakcija — ili sve ili ništa. Client samo prikazuje result count.
- **Grants**: `GRANT EXECUTE ON FUNCTION undo_import_batch TO authenticated;`
- **RLS**: nije potreban dodatni sloj — RPC sam validira ownership.

## 4. Rubni slučajevi

- **Ručno uređivan `confirmed` red** (korisnik promijenio merchant/kategoriju nakon spajanja): `unmerge_import_row` po dizajnu ostavlja korisnikov red netaknut i briše bank pandan → izmjene ostaju. **Potvrditi** pregledom `unmerge_import_row` definicije prije faze 2.
- **Red obrisan u međuvremenu** (soft-delete → trash): preskačemo (WHERE deleted_at IS NULL), broj u summaryju smanjen; toast: "N redova je već obrisano ranije".
- **Batch star X dana**: nema tvrdog limita. **Warning u confirm dijalogu ako > 7 dana**: "Uvoz je star N dana. Sve transakcije nastale poslije ostaju."
- **Bank_reconciliation sidro između**: pokriveno točkom 1c — Opcija A default.
- **Batch čiji je jedan red uključen u budget/project s aktivnostima**: undo briše expense → budget/project usage se recompute-a triggerom. Bez posebne akcije.
- **Nejednake veličine batcha na dva source-a (transfer između dva novčanika, undo pokrenut s jedne strane)**: RPC dohvaća PO `import_batch_id` (isti za obje strane executora) → obje strane se čiste u istoj transakciji. **Potvrditi u `executor.ts` da transfer par dijeli batch_id.**

## 5. Opseg i redoslijed (3 tura)

**Tur 1 — DB (bez UI izmjena)**
- Migracija: RPC `undo_import_batch` + GRANT.
- Manualni test na testnom batchu; provjera da salda dolaze nazad (hybrid engine preview delta 0.00).
- Dokaz: COUNT prije/poslije za `expenses`, `imported_statements`, `custom_payment_sources` (nepromijenjen), `anchor_audit` (nepromijenjen ako nema Opcije B).

**Tur 2 — UI nadogradnja postojećeg `ImportBatchDialog`**
- Novi naslov + jaka potvrda s brojevima (novi/spojeni/prijenosi/iznos).
- Warning za sidro (Opcija A) i za batch > 7 dana.
- Zamjena client `Promise.allSettled` handlera → jedan RPC poziv.
- i18n hr/en/de.
- Vitest za RPC odgovor mapping + confirm dijalog logiku.

**Tur 3 — Ulazne točke i telemetrija**
- Post-import toast s "Poništi" u `ImportReview`.
- Sekundarni link u Reconciliation dijalogu.
- `funnel_events` upis + dashboard read.

**Procjena**: Tur 1 mali (RPC ~80 SQL linija + test), Tur 2 srednji (UI + i18n), Tur 3 mali. Ukupno ~3 iteracije.

## Otvorena pitanja za Milana

1. **Sidro nakon undo** — Opcija A (ostaje + banner "vrati prethodno"), B (auto-revert iz audit), ili C (samo upozorenje)? **Preporuka: A.**
2. **`imported_statements` red**: DELETE (oslobodi fingerprint, dozvoli ponovni uvoz istog PDF-a) vs soft-mark `undone` (blokira reimport)? **Preporuka: DELETE.**
3. **Warning za stare batcheve**: prag 7 dana OK ili drugačije?

Čekam OK prije Tura 1.
