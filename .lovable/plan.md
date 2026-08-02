# Nalaz: sidro i ponovljena pitanja pri uvozu povijesti

## 1. Hipoteza — potvrđena, s oštrijim uzrokom

Provjera se okida u `ImportReview.handleConfirm` → `buildReconciliationSummary` (`src/lib/importReview/executor.ts`), koji za svaki dirnuti izvor zove DB funkciju `preview_source_balance_after_batch`. Ona uspoređuje:

- **app_balance** = `recompute_custom_source_balance_preview(source, 'hybrid')` — sidro + sve transakcije **poslije** datuma sidra;
- **bank_balance** = `balance_after` retka s najvećim `bank_row_seq` **unutar tog batcha** (dakle završni saldo tog jednog izvoda).

Ako je `|delta| > 0.01`, red ide u queue i otvara se dijalog.

Uzrok ponavljanja je konkretniji od "sidro je na današnji dan": pri poravnanju se šalje `asOfIso = new Date().toISOString()` (`src/pages/ImportReview.tsx`, `enqueueReconciliationForBatch`), a `align_source_to_bank` postavlja sidro na `p_as_of + 1s`. Sidro se dakle veže za **trenutak klika**, ne za datum zadnjeg retka izvoda. Audit to i pokazuje: četiri poravnanja unutar 15 minuta danas (0,00 → 33,73 → 346,23 → 536,13 → 252,02), svako s datumom sidra "sada".

Posljedica: sve transakcije (28.1.–26.2.2026.) su prije sidra, pa `app_balance` uvijek ostaje jednak zadnjem sidru, dok je `bank_balance` završni saldo upravo uvezenog izvoda. Ta dva broja se poklope samo ako je uvezeni izvod slučajno zadnji. Kod uvoza povijesti unatrag/naprijed razlika je zajamčena i pitanje se ponavlja pri svakom izvodu. Pitanje je u toj fazi nerješivo: nijedan odgovor nije točan dok povijest nije cijela.

## 2. Razlika 2,20

Nije zaokruživanje. Bankin `balance_after` je na svakom retku točno **kumulativni zbroj transakcija + 2,20**:

| datum | kumulativ u aplikaciji | bankin `balance_after` |
|---|---|---|
| 29.1. | 31,53 | 33,73 |
| 19.2. | 344,03 | 346,23 |
| 24.2. | 533,93 | 536,13 |
| 26.2. | 249,82 | 252,02 |

Razlika je konstantna → to je **stanje računa prije prve uvezene transakcije** (2,20 na 28.1.2026.), koje u aplikaciji ne postoji ni kao transakcija ni kao početno stanje. Sidro ga je "progutalo" pri poravnanju: `balance` = sidro = 252,02, a neto transakcija je 249,82.

## 3. Zašto nema retka u `imported_statements`

Novi tok uvoza (PDF → `ImportReview`) **nikad ne zove `recordImportedStatement`**. Ta se funkcija zove samo iz `CSVImportDialog` i iz starih grana u `GlobalPDFImportHost` (`handleImport` / `handleImportDuplicates`, linije 721 i 783). Grana koja gradi `ImportReviewPayload` i navigira na `/import/review` preskače zapis. Zadnji redak u `imported_statements` za ovog korisnika je od 16.6.2026.

To je stvarni propust, s dvije posljedice:

- **Nema zaštite od dvostrukog uvoza istog izvoda** na razini datoteke (`file_hash` / `content_hash`); ostaje samo dedup po retku (fingerprint).
- **Reconciliation banner/resume ne rade** — `enqueueReconciliationForBatch` traži `imported_statements.id` po `import_batch_id`, ne nađe ga, pa je `importedStatementId = null`; snapshot se ne piše i "Nastavi" se nikad ne nudi. Zatvaranje dijaloga trajno gubi kontekst.

## 4. Prijedlog ponašanja pri uvozu povijesti (za odluku, ne gradim)

Osnovno pravilo: **sidro se veže za datum izvoda, ne za trenutak klika.**

1. `asOfIso` više nije `now()` nego **timestamp zadnjeg retka uvezenog izvoda** (`max(event_at)` / `date` + `bank_row_seq`) za taj izvor u batchu.
2. **Povijesni izvod ne pita ništa.** Ako zadnji redak batcha pada **prije** postojećeg `correction_anchor_date`, dijalog se ne otvara. Umjesto toga tiha poruka: „Povijest dopunjena — stanje ostaje usklađeno sa zadnjim izvodom." Sidro se ne dira, saldo se ne mijenja.
3. **Tek najnoviji izvod usklađuje.** Ako zadnji redak batcha pada **poslije** sidra, ponaša se kao danas (usporedba + dijalog), i novo sidro dobiva datum tog zadnjeg retka.
4. **Provjera povijesti kao zaseban, neobavezan korak.** Kad se uvozi povijesni izvod, i dalje se može izračunati razlika između bankinog `balance_after` tog izvoda i kumulativa aplikacije na taj dan, ali kao *informacija* („povijest se poklapa" / „razlika 2,20 na 28.1."), ne kao pitanje s odlukom.
5. **Početno stanje kao eksplicitan pojam.** Ako se nakon uvoza cijele povijesti zadrži konstantna razlika (kao ovih 2,20), ponuditi jednokratno „postavi početno stanje računa na dan prvog izvoda" umjesto tihog gutanja razlike u sidro.
6. **Popuniti `imported_statements` u ImportReview toku** (vlastiti commit) — vraća dedup po datoteci i resume banner.

## 5. Kako korisnik izlazi sada

Podaci nisu ugroženi: transakcije su netaknute, sidro je samo referentna točka i svaka promjena ostaje u `anchor_audit` (pet redaka, s prijašnjim vrijednostima).

Najčišći izlaz, bez gubitka podataka: **pomaknuti sidro unatrag, prije prve transakcije**, na 28.1.2026. s iznosom **2,20** (stvarno stanje računa prije prvog uvezenog retka). Tada engine računa saldo iz transakcija, svaki novi povijesni izvod se uračunava normalno, a saldo automatski ispada 252,02 bez ijednog pitanja. Radi se postojećom `set_source_anchor` RPC-om, uz zapis u audit — dakle bez zaobilaženja zaštićenog sloja.

Alternativa ako ne želimo pretpostaviti 2,20: sidro na 28.1.2026. s iznosom 0,00 — tada će saldo pokazivati 249,82 dok se početno stanje ne unese.

## Tehnički sažetak dodirnutih mjesta

- `src/pages/ImportReview.tsx` — `asOfIso`, uvjet otvaranja dijaloga, zapis `imported_statements`.
- `src/lib/importReview/executor.ts` — `buildReconciliationSummary`, prag i `needsReconciliation`.
- `preview_source_balance_after_batch` — po potrebi vratiti i datum zadnjeg retka batcha da klijent zna je li izvod povijesni.
- `align_source_to_bank` — bez izmjene logike; mijenja se samo što joj se šalje kao `p_as_of`.
- Deploy gate vrijedi: svaka izmjena ovog sloja traži zelen SQL paket (`supabase/tests/balance/`).
