# F1 — Knjigovodstvena kategorija na ulaznom računu

Prvi korak pripreme za knjigovođu: ulazni račun usmjeren na tvrtku dobiva jednu
knjigovodstvenu oznaku. Slaganje i izvoz paketa nisu u ovom opsegu.

## Što korisnik dobiva

- Na svakom ulaznom računu tvrtke pojavljuje se izbor kategorije:
  **pripadnost projektu**, **alat**, **osnovna sredstva**.
- Aplikacija nudi prijedlog; jedan dodir potvrđuje ga, drugi mijenja. Ako
  prijedloga nema, izbor je i dalje otvoren — ništa se ne blokira.
- Uz kategoriju se prikazuje oznaka **materijalni trošak** kad je račun plaćen
  iz privatnog izvora. Nju korisnik ne bira — sama slijedi iz plaćanja.
- Osobni (ne-poslovni) računi ostaju nepromijenjeni — nema izbora kategorije.

## Gdje se pojavljuje u sučelju

1. **Polica ulaznih računa** (`IncomingInvoicesPanel`): u retku računa mali
   redak s kategorijom — badge kad je postavljena, "Odaberi kategoriju" kad
   nije. Dodir otvara izbornik s tri stavke; ako postoji prijedlog, on je
   označen i ima kratko objašnjenje ("prijedlog").
2. Isti izbor u pregledu računa iz maila (`MailReviewList` / kartica računa)
   samo ako se račun već sprema kao poslovni; ako to zahtijeva promjenu tijeka
   spremanja, ostaje samo na polici (navest ću u izvještaju).
3. Oznaka **materijalni trošak** stoji pored kategorije kao zaseban, neaktivan
   badge s objašnjenjem podrijetla.

## Podaci

Nova migracija nad `incoming_invoices` (samo dodavanje, bez ijednog rušenja):

- `accounting_category text NULL` + CHECK na tri vrijednosti
  (`project`, `tool`, `fixed_asset`)
- `accounting_category_source text NULL` (`ai` | `user`)
- `accounting_category_set_at timestamptz NULL`

Oznaka "materijalni trošak" se **ne sprema** — izvodi se pri prikazu.

RLS: postojeće politike nad `incoming_invoices` pokrivaju nove stupce; nove
politike se ne dodaju.

## Kako se izvodi "materijalni trošak"

Postoji već sve potrebno:

- račun nosi `business_profile_id` (tvrtka) i `paid_expense_id` (trošak kad je
  plaćen),
- trošak nosi izvor plaćanja (`custom:<uuid>` ili gotovina),
- `isPersonalSourceForProfile` (`src/lib/receiptBusinessRouting.ts`) već
  odlučuje je li izvor privatan u odnosu na tu tvrtku.

Pravilo prikaza:

```text
račun nije plaćen            -> bez oznake (nije poznato)
plaćen iz izvora tvrtke      -> bez oznake
plaćen iz privatnog izvora
  ili iz gotovine izvan tvrtke -> "materijalni trošak"
```

Izvedba ide kroz novu čistu funkciju `deriveMaterialExpenseFlag` u
`src/lib/eracun/accountingClassification.ts` — bez mrežnog poziva, nad već
učitanim izvorima plaćanja i troškovima.

## Prijedlog kategorije

- `parse-receipt` dobiva u odgovoru novo neobavezno polje
  `accounting_category` (jedna od tri vrijednosti ili `null`). Postojeća polja
  i ponašanje skena ostaju identična; polje koje nitko ne čita ne mijenja ništa.
- Za račune koji ne prolaze kroz sken (eRačun XML, mail) prijedlog daje ista
  čista funkcija `suggestAccountingCategory` iz dobavljača i stavki računa
  (npr. alat/oprema → "alat", vrijednost iznad praga i trajno sredstvo →
  "osnovna sredstva", račun vezan uz projekt → "pripadnost projektu"). Bez
  dodatnog AI poziva i bez troška.
- Prijedlog se nikad ne sprema sam; sprema se tek kad ga korisnik potvrdi
  (`accounting_category_source = 'user'`) ili kad dolazi izravno sa skena
  (`'ai'`, uz vidljivu oznaku prijedloga).

## Greške pri spremanju

Upis kategorije ide kroz `useIncomingInvoices` (novi `setAccountingCategory`).
Pri padu: zapis u `app_diagnostics_logs` s pozvanom radnjom, `invoice_id`,
doslovnim `code`/`message` iz baze i build žigom; korisniku prevedena poruka
kroz postojeći `describeInvoiceDbError` — nikad generička. Ako bi zapis prošao
a osvježenje palo, poruka izričito kaže oboje.

## Tehnički detalji

Dirano:

- migracija: tri nova stupca + CHECK na `incoming_invoices`
- `src/lib/eracun/accountingClassification.ts` (novo): popis kategorija,
  `suggestAccountingCategory`, `deriveMaterialExpenseFlag`
- `src/hooks/useIncomingInvoices.ts`: nova polja u tipu + `setAccountingCategory`
- `src/components/business/eracun/IncomingInvoicesPanel.tsx` (612 redaka):
  redak računa se ionako dira, pa se **izdvaja** u
  `InvoiceRow.tsx` bez promjene ponašanja, a funkcionalno se dodaje samo blok
  kategorije/oznake. Izdvojeno i funkcionalno bit će odvojeno navedeno u
  izvještaju.
- `supabase/functions/parse-receipt/index.ts`: jedno neobavezno izlazno polje
- prijevodi hr/en/de
- testovi: prijedlog kategorije, izvedena oznaka (plaćeno/neplaćeno, privatni/
  poslovni izvor), osobni račun bez izbora

Ne dira se: motor salda i anchor, `expenses` i put spremanja troška, uvoz
izvoda, dedup/otisak, `business_debts` i owner-loan logika, atribucija, RLS,
scanner tijek, izvoz/paket za knjigovođu, mail slanje, osobni računi. Ne
objavljuje se.

## Otvorena pretpostavka

"Pripadnost projektu" tretiram kao oznaku vrste troška, ne kao vezu na
konkretan projekt (bez odabira projekta u ovom koraku). Ako želiš stvarnu vezu
na projekt, to je dodatno polje i dodatni izbor — reci pa prilagodim.
