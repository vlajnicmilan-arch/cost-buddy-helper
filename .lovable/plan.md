# F1 — Knjigovodstvena kategorija na ulaznom računu

Prvi korak pripreme za knjigovođu: ulazni račun dobiva jednu knjigovodstvenu
oznaku, a kad je oznaka „pripadnost projektu" — i stvarnu vezu na projekt.
Slaganje i izvoz paketa nisu u ovom opsegu.

## Što korisnik dobiva

- Na ulaznom računu izbor kategorije: **pripadnost projektu**, **alat**,
  **osnovna sredstva**.
- Kad odabere „pripadnost projektu", otvara se **postojeći izbornik projekata**
  (isti koji se koristi pri unosu troška — `AttachmentBar`, chip „Projekt", s
  grupiranjem po osobnom/tvrtkama). Nema novog izbornika. Za „alat" i „osnovna
  sredstva" nema odabira projekta.
- Pripisivanje projektu je moguće na **bilo kojem** ulaznom računu, ne samo na
  onom koji glasi na tvrtku — tipično kad je posao plaćen privatnom karticom
  ili gotovinom.
- Aplikacija nudi prijedlog kategorije; jedan dodir potvrđuje ga, drugi mijenja.
  Bez prijedloga izbor je i dalje otvoren — ništa se ne blokira.
- Uz kategoriju se prikazuje oznaka **materijalni trošak** kad je takav račun
  plaćen iz privatnog izvora. Nju korisnik ne bira — sama slijedi iz plaćanja.

## Tko ulazi u pripremu za knjigovođu

```text
račun glasi na korisnikovu tvrtku (OIB/ime kupca)   -> poslovni
ILI je pripisan projektu koji pripada tvrtki        -> poslovni
inače (ni firma, ni poslovni projekt)               -> osobni, izvan pripreme
```

Jedno mjesto odluke: čista funkcija `isAccountingRelevantInvoice` u novoj
datoteci `src/lib/eracun/accountingClassification.ts`. Osobni računi ostaju
nepromijenjeni — bez izbora kategorije i bez oznaka.

## Gdje se pojavljuje u sučelju

1. **Polica ulaznih računa** (`IncomingInvoicesPanel`): u retku računa redak s
   kategorijom — badge kad je postavljena, „Odaberi kategoriju" kad nije. Dodir
   otvara izbornik s tri stavke; prijedlog je označen kao „prijedlog".
   Odabir „pripadnost projektu" odmah prikazuje postojeći chip za projekt.
2. Odabir projekta je dostupan i kad račun nije usmjeren na tvrtku — chip je
   vidljiv na svakom ulaznom računu.
3. Oznaka **materijalni trošak** stoji pored kategorije kao neaktivan badge s
   objašnjenjem podrijetla.
4. Pregled računa iz maila (`MailReviewList`) dobiva isti izbor samo ako to ne
   mijenja tijek spremanja; inače ostaje samo na polici (navest ću u izvještaju).

## Podaci

`incoming_invoices` danas **nema** `project_id` (provjereno u shemi). Jedna
additivna migracija, bez ijednog rušenja:

- `accounting_category text NULL` + CHECK (`project`, `tool`, `fixed_asset`)
- `accounting_category_source text NULL` (`ai` | `user`)
- `accounting_category_set_at timestamptz NULL`
- `project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL`
  + indeks

Oznaka „materijalni trošak" se **ne sprema** — izvodi se pri prikazu.
RLS: postojeće politike nad `incoming_invoices` pokrivaju nove stupce; nove
politike se ne dodaju.

## Kako se izvodi „materijalni trošak"

Postoji već sve potrebno:

- račun nosi `business_profile_id`, sad i `project_id`, te `paid_expense_id`,
- trošak nosi izvor plaćanja (`custom:<uuid>` ili gotovina),
- `isPersonalSourceForProfile` već odlučuje je li izvor privatan u odnosu na
  tvrtku.

```text
račun nije poslovni (ni firma ni poslovni projekt) -> bez oznake
račun nije plaćen                                  -> bez oznake (nije poznato)
plaćen iz izvora te tvrtke                         -> bez oznake
plaćen iz privatnog izvora ili gotovine            -> "materijalni trošak"
```

Mjerodavna tvrtka je tvrtka računa, a ako je nema — tvrtka pripisanog projekta.
Izvedba: čista funkcija `deriveMaterialExpenseFlag` u istoj novoj datoteci, bez
mrežnog poziva, nad već učitanim izvorima plaćanja i troškovima.

## Prijedlog kategorije

- `parse-receipt` dobiva u odgovoru novo neobavezno polje
  `accounting_category` (jedna od tri vrijednosti ili `null`). Postojeća polja i
  ponašanje skena ostaju identična.
- Za račune koji ne prolaze kroz sken (eRačun XML, mail) prijedlog daje čista
  funkcija `suggestAccountingCategory` iz dobavljača i stavki računa (alat/oprema
  → „alat"; trajno sredstvo iznad praga → „osnovna sredstva"; inače
  „pripadnost projektu"). Bez dodatnog AI poziva i bez troška.
- Prijedlog se nikad ne sprema sam; sprema se tek kad ga korisnik potvrdi
  (`source = 'user'`) ili kad dolazi izravno sa skena (`'ai'`, uz oznaku
  prijedloga). Odabir projekta uvijek traži korisnikovu potvrdu.

## Greške pri spremanju

Upis ide kroz `useIncomingInvoices` (novi `setAccountingCategory`, koji u istom
pozivu sprema i `project_id`). Pri padu: zapis u `app_diagnostics_logs` s
pozvanom radnjom, `invoice_id`, doslovnim `code`/`message` iz baze i build
žigom; korisniku prevedena poruka kroz `describeInvoiceDbError` — nikad
generička. Ako bi zapis prošao a osvježenje palo, poruka izričito kaže oboje.

## Tehnički detalji

Dirano:

- migracija: `accounting_category`, `accounting_category_source`,
  `accounting_category_set_at`, `project_id` + CHECK, FK i indeks
- `src/lib/eracun/accountingClassification.ts` (novo): popis kategorija,
  `suggestAccountingCategory`, `isAccountingRelevantInvoice`,
  `deriveMaterialExpenseFlag`
- `src/hooks/useIncomingInvoices.ts`: nova polja u tipu + `setAccountingCategory`
- `src/components/business/eracun/IncomingInvoicesPanel.tsx` (612 redaka): redak
  računa se ionako dira, pa se **izdvaja** u `InvoiceRow.tsx` bez promjene
  ponašanja; funkcionalno se dodaje samo blok kategorije/projekta/oznake.
  Izdvojeno i funkcionalno bit će odvojeno navedeno u izvještaju.
- ponovna uporaba `AttachmentBar` (chip „Projekt") — bez izmjene njegovog
  ponašanja; po potrebi samo prosljeđivanje propova
- `supabase/functions/parse-receipt/index.ts`: jedno neobavezno izlazno polje
- prijevodi hr/en/de
- testovi: prijedlog kategorije; pravilo „poslovni" (firma / poslovni projekt /
  osobni); izvedena oznaka (plaćeno/neplaćeno, privatni/poslovni izvor);
  spremanje veze na projekt

Ne dira se: motor salda i anchor, `expenses` i put spremanja troška, uvoz
izvoda, dedup/otisak, `business_debts` i owner-loan logika, atribucija troška,
RLS, scanner tijek, izvoz/paket za knjigovođu, mail knjigovođi, čišćenje slike,
glavni prekidač. Ne objavljuje se.
