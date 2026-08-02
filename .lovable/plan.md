# Spajanje uplata iz izvoda s računima (eRačun ↔ transakcija)

## Provjereno

- `incoming_invoices` ima `direction`, `payment_reference`, `settled_amount`, `paid_at`, `counterparty_name/oib`, `iban`.
- `expenses` ima `invoice_id` (uuid) — **0 popunjenih redaka**, ostatak od obrisane `invoices` tablice. Iskoristivo kao veza uplata → račun, uz preusmjeravanje na `incoming_invoices`.
- Nema nijednog modula za spajanje — potvrđeno, ne postoji.

## 1. Slojevito spajanje (`src/lib/eracun/matchPayments.ts`, čist modul + testovi)

Ulaz: nenaplaćeni računi + kandidatske transakcije iz izvoda (isti smjer novca, ista valuta, prozor ±90 dana **u oba smjera** — uplata prije izdavanja je legitimna).

Slojevi, prvi koji pogodi pobjeđuje:

1. **Poziv na broj** — normaliziran `payment_reference` s računa (maknuti `HR00`, sve osim znamenki) pronađen kao cjelovit niz u normaliziranom opisu transakcije **i** iznos se poklapa → `confidence: certain`. Jedino ovo smije automatski.
2. **Naučeni IBAN** (sloj 2, vidi dolje) + točan iznos → `strong`, prijedlog za potvrdu.
3. **Iznos + naziv** — iznos jednak na cent, naziv prepoznat → `likely`, prijedlog.
4. Inače nespojeno.

**Mjerenje sličnosti naziva (bez nagađanja):** oba naziva normaliziraju se — mala slova, dijakritici → ASCII, uklanjanje pravnih/šumnih riječi (`d.o.o.`, `j.d.o.o.`, `obrt`, `vl.`, `građevinski`, gradovi iz fiksnog popisa), pa razbijanje na tokene ≥3 znaka. Podudaranje = **svi tokeni kraćeg naziva sadržani u dužem** (token-subset), a kraći ima **barem 2 tokena**. Primjer: `bami interijer` ⊂ `bami interijer gradevinski obrt osijek` → pogodak. Bez fuzzy udaljenosti, bez pragova sličnosti — deterministično i objašnjivo. Jedan token (`bami`) nije dovoljan.

Dvosmislenost: ako jedan račun pogađa više transakcija ili obrnuto na istoj razini, **svi ti prijedlozi padaju na `likely` i traže izbor** — nikad tiho biranje prvog.

## 2. Učenje (nova tablica `eracun_counterparty_iban`)

`user_id, business_profile_id, iban, counterparty_oib, counterparty_name, confirmed_count, last_seen_at`. Upis pri svakoj **potvrdi** spajanja: izvuče se IBAN iz opisa transakcije (regex `HR\d{19}`) i veže na OIB druge strane s računa. Sljedeći put taj IBAN daje `strong` bez ovisnosti o nazivu. RLS po `user_id`, GRANT authenticated + service_role.

## 3. Djelomične uplate

- Spajanje upisuje `settled_amount = settled_amount + iznos_uplate` (clamp na `total_amount`).
- `paid_at` se postavlja **samo kad `settled_amount >= total_amount`** (tolerancija 0,01). Do tada račun ostaje na popisu nenaplaćenih s prikazom „plaćeno X od Y".
- **Jedna uplata → više računa:** veza je M:N, pa nova tablica `eracun_payment_links` (`invoice_id`, `expense_id`, `amount`, `matched_by`, `created_at`) umjesto `expenses.invoice_id`. U prijedlogu se nudi i **skupno podudaranje**: podskup nenaplaćenih računa iste druge strane čiji zbroj = iznos uplate (traži se samo do 4 računa, inače preskače).
- Preostalo neraspoređeno od uplate ostaje vidljivo; korisnik može dodati još veza.

## 4. Gdje se potvrđuje

Ponovna upotreba postojećeg obrasca `ImportReview`, ne novi mehanizam: nakon uvoza izvoda (i na zahtjev iz `IncomingInvoicesPanel` gumbom „Poveži uplate") otvara se `PaymentMatchReview` — lista prijedloga, po retku: račun, uplata, razlog podudaranja (`poziv na broj` / `naučeni IBAN` / `iznos + naziv`), checkbox, gumb Potvrdi. `certain` redovi predoznačeni, ostali ne.

## 5. Tvrdo pravilo

Spajanje **ne stvara ni prihod ni trošak** i ne dira saldo ni sidro. Piše isključivo `eracun_payment_links` + `settled_amount`/`paid_at` na računu. Isto pravilo kao kod „Naplaćeno" — zapisano u komentaru modula da ga netko ne „popravi".

## Tehnički koraci

1. Migracija: `eracun_payment_links`, `eracun_counterparty_iban` (RLS + GRANT), drop neiskorištenog `expenses.invoice_id`.
2. `matchPayments.ts` + `normalizeName.ts` + testovi (BAMI slučaj: uplata prije računa, HR99 model, mojibake naziv).
3. `useEracunPaymentMatch.ts` — dohvat kandidata, potvrda u transakciji, upis naučenog IBAN-a.
4. `PaymentMatchReview.tsx` + ulaz iz `IncomingInvoicesPanel` i post-import.
5. i18n hr/en/de; prikaz „plaćeno X od Y" u panelu i widgetu.

## Procjena

2–3 dana.

**Drugi krug:** automatsko pokretanje spajanja pri svakom uvozu bez pitanja, spajanje ulaznih računa s izlaznim plaćanjima iz izvoda (isti motor, obrnuti smjer), razvezivanje (undo) pojedine veze, podsjetnici klijentima za dospjele nenaplaćene.
