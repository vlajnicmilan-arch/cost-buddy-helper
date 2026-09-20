# Mišljenje o programu „Temelj" (sloj novca)

Samo procjena. Ništa nije mijenjano.

## 1. A1 („sync kroz ImportReview") vs. B-a (zajednička jezgra + red na pregled)

B-a je realniji put u ovom kodu. A1 bi značio prepisivanje `supabase/functions/bank-sync-transactions/index.ts` (908 redaka) u klijentski tok i gubitak automatike (cron/resume sync), a ImportReview je danas klijentski: `src/lib/importReview/executor.ts` (1260 redaka) radi kroz korisnikov Supabase klijent, RPC-ove `lookup_import_fingerprints` / `restore_deleted_import_row` i UI odluke.

Što oba ulaza VEĆ dijele (preko `_shared` zrcala s testovima zrcaljenja):
- smjer novca: `moneyDirection.ts` + `buildTransferPair` (jedini slagač para),
- kartice: `cardMatch.ts`,
- protustrana: `transferCounterpart.ts`,
- uparivanje dviju strana: `transferPairMatch.ts` (sync ga zove oko red. 470 u `index.ts`; import kroz `importReview` PAIR plan).

Što NE dijele:
- **identitet retka**: sync koristi `pickStableId(tx)` iz `_shared/bankSyncDecision.ts` (bankin `entry_reference`), uvoz koristi `computeImportFingerprint` iz `src/lib/importFingerprint.ts`. Dvije različite definicije istog retka → isti novac s dva izvora se ne prepoznaje kroz `uniq_expenses_user_bank_tx`, spašava ga samo `transferPairMatch`.
- **spajanje s ručnim retkom**: sync ima `pickMergeTarget` u `bankSyncDecision.ts`, uvoz ima MERGE granu u `executor.ts` (`.is('bank_transaction_id', null)` race-guard) — različita pravila i različit ishod za merchant/kategoriju.
- **upis**: sync `admin.from("expenses").insert(...)` servisnim ključem; uvoz bulk `upsert` s `onConflict (user_id, bank_transaction_id)` + obnova soft-obrisanog retka. Sync nema ni obnovu obrisanog ni „skippedMerged" brojanje.
- **pregled**: sync nema red „na pregled" — dvosmisleno se samo zapiše u `app_diagnostics_logs` (`transfer_pair_ambiguous`, `transfer_candidate_ambiguous`) i pogodi.

Preporuka: iz `executor.ts` izvući odluku (ne upis) u `_shared` modul `moneyLedgerPlan` — ulaz: normalizirani redci, postojeći kandidati, kartice, novčanici; izlaz: plan (`new` / `merge` / `pair` / `needs_review`). Sync i uvoz zovu istu funkciju i razlikuju se samo u izvršitelju i u tome tko potvrđuje `needs_review`. To je 3–4 naloga, a ne „iznova".

## 2. Otisak (B-b)

V2 ključ VEĆ postoji i nije uključen: `computeImportKey` / `importKeyCanonicalString` / `computeImportKeys` u `src/lib/importFingerprint.ts` (prefiks `imp2`, bez AI-teksta, bez `type`, s `bal:` ili `ord:N`). Produkcijski put i dalje zove `computeImportFingerprint` (`GlobalPDFImportHost.tsx`, `csvParsers.ts`, `importReview/types.ts`, `statementFingerprint.ts`).

Rizik promjene ključa:
- `uniq_expenses_user_bank_tx (user_id, bank_transaction_id) WHERE NOT NULL` ostaje netaknut — mijenja se sadržaj, ne indeks. Nema DDL rizika.
- Stvarni rizik je **jedan val duplikata pri prijelazu**: postojeći redci nose `imp:` ključeve, novi uvoz istog izvoda daje `imp2:` → sve prolazi kao novo.
- Drugi rizik: `lookup_import_fingerprints` i `restore_deleted_import_row` traže točan string; soft-obrisani `imp:` redci prestaju biti pronalaženi → obrisani redak se vrati kao novi.

Siguran prijelaz bez novog vala:
1. Prijelaznu fazu voditi **dvostrukim ključem**: prvo traži `imp2:`, ako nema — traži stari `imp:` istog retka i, kad se nađe, zapiši `imp2:` na njega (rekey, ne insert). To je ista logika koju `executor.ts` već ima za „postojeći redak bez `bank_transaction_id`".
2. Backfill u SQL-u mora reproducirati `importKeyCanonicalString` znak po znak (komentar u kodu to izričito traži) — za retke bez salda `ord:N` se u SQL-u ne može pogoditi bez izvornog redoslijeda izvoda, pa te retke ne rekeyati nego ih ostaviti na `imp:` i tražiti oba ključa.
3. `lookup_import_fingerprints` i `restore_deleted_import_row` prošireni na popis ključeva (v1+v2), inače se veza s obrisanima gubi.
4. Tek nakon što je dvostruka pretraga živa mjesec dana — ugasiti pisanje `imp:`.

## 3. Sidro vs. promet (B-c) — potvrđeno iz koda

Žива definicija `recompute_custom_source_balance` (obje grane, `day_cut` i `hybrid`) zbraja SAMO retke strogo nakon sidra:
`(e.date AT TIME ZONE 'UTC')::date > (v_anchor_date ...)::date`, uz `deleted_at IS NULL`, `expense_nature <> 'correction'`, `status = 'approved'`. Bez sidra funkcija je no-op (`RETURN NULL`, saldo drži delta-put).

Dakle: duplikati **prije** sidra ne ulaze u prikazano stanje, ali izvještaji i kategorije (`useExpenseFetch` → izvještaji) čitaju `expenses` bez ikakvog sidrenog reza — ulaze u potpunosti. B-c je točan: točka 2 bez točke 1 daje točan saldo uz lažan promet.

## 4. Procjena po nalozima (ne danima)

| Korak | Nalozi | Rizik za salda |
|---|---|---|
| B-b otisak v2 + dvostruka pretraga + rekey | 2–3 | srednji (soft-delete/restore veza) |
| Zajednička jezgra odluke + red „na pregled" | 3–4 | **najveći** — svaki novi/izmijenjeni redak okida `trg_expenses_recompute_source_balance` |
| Sidro iz izvoda (završni saldo PDF/CSV) | 1–2 | visok po posljedici, nizak po opsegu |
| Kategorije (stablo + rekategorizacija) | 2 | nula |
| Obrada / mjesečni pogled | 2–3 | nula |

Najveći rizik nosi jezgra odluke, jer mijenja tko i kada piše u `expenses`, a saldo visi o okidaču. Prije njega mora biti zelen SQL paket `supabase/tests/balance/` (to je već zapisana brana).

## 5. Što dodati, što maknuti

Maknuti: A1 u obliku „sync kroz ekran". Zadržati automatiku, dodati red na pregled.

Tri mine koje program ne spominje:
1. **Servisni ključ zaobilazi RLS u syncu.** `bank-sync-transactions` piše `admin` klijentom; svaka greška u `userId` scopeu upisuje tuđe retke i nijedna RLS politika to neće zaustaviti. Jezgra mora dobiti `user_id` kao obavezan ulaz i imati test „ne piše izvan vlasnika".
2. **Sidro i uvoz se bore za isti saldo.** `apply_balance_delta_if_unanchored` + `_cps_balance_guard_*` znače da isti uvoz daje različit saldo ovisno o tome je li novčanik usidren. Program mora definirati redoslijed: uvijek prvo redci, pa sidro — nikad obrnuto.
3. **`ord:N` bez salda nije stabilan između dva čitanja istog izvoda.** Ako AI vrati redke u drugom redoslijedu (KEKS), v2 ključ se mijenja isto kao v1. Treba ga vezati za redoslijed u izvornom tekstu (`inbound_attachments.extracted_text`), ne za redoslijed AI izlaza.

Dodatno: `transfer_counterpart_origin` i `counterpart_bank_transaction_id` trenutno nemaju obrnutu provjeru (par upisan na jednu stranu, druga strana kasnije obrisana) — vrijedi jedan invariant u `stress/invariants/layer1.sql`.

## 6. Živi test (B-d)

- Fixtures: izvući `inbound_attachments.extracted_text` za korisnikove stvarne izvode (Aircash 8/9, Revolut, TZ sync payload), anonimizirati IBAN/ime/OIB i spremiti kao datoteke u `e2e/fixtures/statements/` uz snimljeni Enable Banking JSON odgovor. Prava produkcijska tablica se time više ne dira.
- Izvođenje: po uzoru na `e2e/security/helpers/fixtures.ts` i `global-setup.ts` napraviti testnog korisnika s prepoznatljivim prefiksom, uvesti fixture dvaput, pa pustiti lažni sync payload preko istog fixture skupa.
- Brana: očekivanje je `count(expenses) == N` nakon drugog prolaza (nula duplikata), `sum` prometa po novčaniku jednak zbroju izvoda, i nula `transfer_pair_ambiguous` zapisa. Dodati kao job u `.github/workflows/test.yml` ili zaseban `merge-sql-suite.yml` stil workflow.
- Čišćenje: `global-teardown.ts` + `e2e_reset_user` — inače testni redci kvare brojke vlasnika.

## Zaključak

Program je dobar, ali redoslijed treba biti: **B-b (otisak) → zajednička jezgra odluke + red na pregled → sidro iz izvoda → kategorije → obrada**, uz `supabase/tests/balance/` i živi test iz točke 6 kao brane. „Iznova" nije potrebno; potrebno je dovršiti spajanje dvaju postojećih ulaza na jednu odluku.
