# Krug: podjela računa po stavkama ili iznosu (samo plan)

## Stanje (provjereno u bazi i kodu)

- Podjela u Krugu danas = postotak CIJELOG troška: `krug_expense_split_share.share_percent`, vezano uz `krug_expense_split_override` (statusi pending/potvrdjena/povucena/odbijena; prijedlog kroz `krug_override_propose`, odluka A1/A2 kroz `krug_apply_act`).
- „Tko kome" računa server: `krug_settlement_preview` — `owed = iznos_troška × share_percent / 100`, uz FX konverziju i zbirni prijenos dužnik→povjeritelj. U bazi: 2 retka podjele, 1 override.
- Stavke računa postoje u `receipt_items` (naziv, količina, jed. cijena, ukupno) samo kad je račun skeniran; Krug ekrani ih danas ne čitaju.
- Podmirenje: `krug_settlement_ledger` + `krug_mark_settled_with_source` / `krug_confirm_settlement_receipt` (`expense_nature='krug_settlement'`, obje strane izuzete iz potrošnje).
- Osobna statistika: autorov zajednički trošak danas se cijeli broji kao njegova potrošnja; dijeljeni troškovi članova se autoru ne broje.

## 1. Varijanta A — „dijeljeni iznos"

- Na trošku u Krugu, uz postotke, izbor „Dijeli samo X €" (X ≤ iznos troška, zadano = cijeli iznos).
- Model: `krug_expense_split_override` dobiva stupac `shared_amount numeric NULL` (NULL = cijeli iznos; današnje ponašanje). `share_percent` se i dalje odnosi na 100% — ali 100% dijeljenog iznosa, ne troška.
- `krug_settlement_preview`: `v_amount_display` za dijeljeni dio = `LEAST(shared_amount, iznos)`; ostatak (`iznos − shared_amount`) ostaje isključivo autorov i ne ulazi u „Tko kome".
- Ručni unos, skenirani račun, bankovni redak — sve radi jednako; bez stavki.

## 2. Varijanta B — „po stavkama"

- Kad trošak ima `receipt_items`, autor označi zajedničke stavke; zbroj označenih = dijeljeni iznos.
- Model: nova tablica `krug_expense_split_item` (override_id, receipt_item_id) — izvor istine je izbor stavki, a `shared_amount` je izvedena vrijednost (zbroj stavki), upisana u isti stupac kao u A. Time „Tko kome", podmirenje i obavijesti rade identično kao u A; B je samo drugi način odabira iznosa.
- Validacija: stavke moraju pripadati tom trošku; zbroj ≤ iznos troška; ako se stavke računa kasnije promijene (ponovno skeniranje), dijeljeni iznos se preračunava iz označenih stavki.
- Ručni unos bez stavki → automatski varijanta A.

## 3. Ponašanje (obje varijante)

- **„Tko kome" i podmirenje:** jedina izmjena je iznos koji ulazi u raspodjelu (`shared_amount` umjesto punog iznosa). Prijenosi, FX snapshot, ledger i potvrda primitka ne diraju se.
- **Statistika i izvješći autora:** autorov osobni dio (`iznos − shared_amount`) ostaje njegova potrošnja; dijeljeni dio se i dalje broji autoru kao plaćeno (on je platio račun), a članovima se ne upisuje ništa — kao i danas. Nema dvostrukog brojanja jer „Tko kome" nije trošak, nego dug.
- **Prijedlog i potvrda (A1/A2):** `krug_override_propose` dobiva `p_shared_amount` (i u B popis stavki); prijedlog, obavijest autoru, potvrda/odbijanje i dedup ostaju isti tok. Tekst obavijesti dobiva „dijeli se X € od Y €".
- **Izmjena nakon potvrde:** kao i danas — novi prijedlog (override) koji zamjenjuje stari; dijeljeni iznos je dio prijedloga, pa se mijenja istim putem.
- **Spajanje s bankovnim retkom (merge):** merge čuva postojeći redak troška (i njegov `expense_id`), pa override i stavke preživljavaju. Čuvar: ako merge promijeni iznos troška ispod `shared_amount`, dijeljeni iznos se steže na iznos (LEAST u preview-u) — bez greške.
- **Brisanje:** soft delete troška već isključuje trošak iz preview-a; override/stavke ostaju kao trag, bez dodatne logike.

## 4. Migracije, RLS, testovi, nalozi

- **Migracije (additivne):**
  - A: `ALTER TABLE krug_expense_split_override ADD COLUMN shared_amount numeric NULL` + `COMMENT`; `krug_override_propose` i `krug_settlement_preview` napisane od žive definicije (`pg_get_functiondef`); REVOKE/GRANT nepromijenjeni (isti potpisi, iste uloge).
  - B: `CREATE TABLE krug_expense_split_item` + GRANT authenticated (SELECT/INSERT/DELETE preko RPC), RLS (članovi Kruga čitaju; upis samo kroz RPC), indeks po override_id.
- **Testovi:**
  - SQL čuvari (novi paket `krug_shared_amount`): dijeljeni iznos ulazi u „Tko kome", ostatak ne; postotci se zbrajaju na 100 dijeljenog iznosa; shared_amount > iznos se odbija; FX konverzija na dijeljeni iznos; A1 potvrda/A2 odbijanje s iznosom; merge ne gubi podjelu; brisanje; prava.
  - B dodatno: zbroj označenih stavki = dijeljeni iznos; stavke tuđeg troška se odbijaju; promjena stavki preračunava iznos.
  - vitest: forma „Dijeli samo X €", odabir stavki, tekstovi obavijesti, prikaz „dijeli se X od Y".
  - Zeleni moraju ostati: `krug_settle`, `krug_notify_outbox`, `worker_payout_*`, balance deploy gate.
- **Nalozi:** A = 1 nalog (migracija + preview + forma + testovi). B = 1 dodatni nalog (tablica + odabir stavki + testovi). B bez A nema smisla jer B koristi `shared_amount`.

## 5. Preporuka: A odmah, B kasnije

- A rješava vlasnikovu priču (40 € račun, dijeli se 12 €) jednim poljem, radi za ručni unos i banku, dira samo jedan stupac i jednu formulu u preview-u.
- B je udobniji odabir istog iznosa, ali ovisi o skeniranom računu i dodaje tablicu, RLS i rubne slučajeve (promjena stavki). Vrijedi ga graditi tek kad A pokaže stvarnu potrebu za stavkama.
- B se kasnije nadovezuje bez promjene modela: isti `shared_amount`, samo drugi način odabira.

## 6. Postojeći zapisi

- 2 postojeće podjele i 1 override se ne diraju; `shared_amount NULL` = cijeli iznos, pa je njihovo ponašanje bitno identično.

## Otvoreno pitanje za vlasnika

- Treba li članu u obavijesti/prijedlogu prikazati i popis stavki (B), ili je dovoljan iznos (A)?
