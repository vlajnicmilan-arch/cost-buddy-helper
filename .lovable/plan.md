# eRačun — izlazni računi iz istog XML-a (priprema za izvode)

## Provjereno u projektu

- `parseUbl.ts` već čita **obje strane** (`supplier` i `customer` s OIB-om), te `iban` i `paymentReference` (`PaymentMeans/PaymentID`, fallback `PaymentTerms/Note`). Ti podaci se trenutno **gube** — `toInsertRow` ih ne prenosi (osim IBAN-a), a `incoming_invoices` nema stupac za poziv na broj ni za kupca.
- `business_profiles`: Tactura `33941873288` (aktivna), Akrobat `39916265994`. OIB je upisan za obje → automatsko određivanje smjera je izvedivo.
- `invoices` tablica: **0 redaka** — mrtva.
- `project_invoices`: 1 redak, status `issued`. To su računi koje app sam generira prema klijentu (ima `items`, `pdf_path`, `estimate_id`, podsjetnike).
- `incoming_invoices`: 84 retka, `supplier_*` polja, `paid_expense_id`, `paid_at`.

Nisam vidio stvarne XML-ove korisnika, pa **ne mogu tvrditi** koliko su pouzdano popunjeni `PaymentID` i IBAN. To je prvi korak plana, ne pretpostavka.

## Odgovori na pitanja

**1. Gdje spremiti.** Ne nova tablica i ne `project_invoices`. Najčišće je **`incoming_invoices` + stupac smjera** (`direction`: `in` | `out`), preimenovano samo u glavi (tablica ostaje ista zbog svega što na nju visi). Razlog: identičan XML, identičan parser, identičan otisak, identična pravila prihvaćanja, isti uvoz. Dvije tablice značile bi dupli parser i dupli duplikat-check.

`project_invoices` ostaje **izvor za račune koje app izdaje** (PDF, ponude, podsjetnici). Uvezeni izlazni račun je vanjski dokument iz knjigovodstva — nije isto. Veza projekt ↔ uvezeni izlazni račun ide kroz nullable `project_id` na istoj tablici (drugi krug), a ne kroz upis u `project_invoices`.

`invoices` (0 redaka) — prijedlog: obrisati u istoj migraciji.

**2. Što se prati.** Umjesto `supplier_*` uvodi se neutralna druga strana:
- `direction` (`in`/`out`), `counterparty_name`, `counterparty_oib` (postojeći `supplier_*` se preslika i zadrži kao generirani/legacy izvor dok se kod ne prebaci)
- stanja: ulazni → `unpaid` / `paid`; izlazni → `unpaid` (klijent duguje) / `paid` (naplaćeno). Isto polje, zrcalno značenje. Postojeći `paid_at` pokriva oboje; `paid_expense_id` ostaje samo za ulazne.
- `settled_amount` (numeric, default 0) — priprema za djelomične uplate iz izvoda.

**3. Prikaz.** Jedan ekran, dva taba: **„Duguju mi"** / **„Dugujem"**, plus zaglavlje s neto pozicijom (razlika). Dashboard: postojeći blok neplaćenih ulaznih dobiva **drugi red za izlazne** (isti widget, dvije linije) — ne novi widget. Pravilo ostaje tvrdo: **ni ulazni ni izlazni računi ne ulaze u zbrojeve salda niti u `expenses`.**

**4. Priprema za izvode (spremiti odmah).** `payment_reference`, `iban`, `counterparty_oib`, `direction`, `settled_amount`. To je minimum za determinističko spajanje izvoda po pozivu na broj, s IBAN+iznos kao rezervom. Bez toga bi uvoz izvoda tražio novu migraciju.

**5. Procjena.** 2–3 dana.
Drugi krug (svjesno izostavljeno): veza s projektom, djelomične uplate u UI-u, sam uvoz izvoda i motor spajanja, podsjetnici klijentima za izlazne.

## Tehnički koraci

1. **Provjera podataka (prvo, prije koda).** Korisnik dostavi 2–3 izlazna XML-a iz knjigovodstva; provjeriti postoje li `PaymentMeans/PaymentID` i IBAN i u kojem obliku. O rezultatu ovisi je li spajanje s izvodom determinističko ili heuristika.
2. **Migracija:** `direction` (NOT NULL, default `'in'`), `counterparty_name`, `counterparty_oib`, `payment_reference`, `settled_amount`. Backfill: sve postojeće = `in`, `counterparty_* := supplier_*`. Unique indeksi prošireni s `direction` (isti broj računa može postojati u oba smjera). Drop `invoices`.
3. **`resolveDirection.ts`** (čist modul + testovi): usporedba OIB-a aktivne tvrtke sa `supplier.oib` / `customer.oib` → `in` | `out` | `foreign`. `foreign` = upozorenje „račun ne pripada ovoj tvrtki", redak isključen po defaultu.
4. **`intakeBatch.ts`**: `toInsertRow` prenosi smjer, drugu stranu i poziv na broj. Otisak proširen smjerom.
5. **UI:** `EracunImportDialog` prikazuje stupac smjera po retku; `IncomingInvoicesPanel` dobiva tabove; dashboard widget drugu liniju; i18n hr/en/de.
6. **Testovi:** `resolveDirection` (in/out/foreign/nedostaje OIB), sažetak po smjeru, regresija da ulazni uvoz radi kao prije.

Ne dira se: postojeći tok ulaznih računa u ponašanju, `expenses`, motor salda, korak E, zaštite A/D/D2.
