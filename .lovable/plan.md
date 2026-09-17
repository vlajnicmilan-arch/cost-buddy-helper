# Predaja knjigovođi — preseljenje s ulaznih računa na fotografirane troškove

Knjigovođa eRačune i PDF-ove s maila već ima. Predaja zato mora sadržavati samo ono što
nema: fotografirane/skenirane papirnate račune, koji u Centru žive kao **troškovi sa slikom**.

## Koliko je ovo posla

Uglavnom preusmjeravanje, ne novo gradilište:

- **Ostaje netaknuto:** PDF izlaz, Excel izlaz, ZIP, čišćenje slike, tablica razdoblja i
  prekidač po tvrtki. Ti dijelovi rade nad zajedničkim oblikom retka (`HandoverRowView`),
  pa im se mijenja samo dobavljač podataka.
- **Prepisuje se jedna datoteka:** odabir i grupiranje (`handoverPackage.ts`) sada čita
  troškove umjesto ulaznih računa.
- **Briše se:** traka i blok kategorije s ulaznih računa.
- **Migracija:** samo jedan neobavezan stupac (vidi „Kategorija"), i to je jedina.

## Skup „za predaju" — potvrđeno u bazi

Trošak ulazi kad vrijedi sve:

1. `type = 'expense'`, `deleted_at IS NULL`, `invoice_id IS NULL` (nije vezan na eRačun),
2. `receipt_url IS NOT NULL` (postoji slika/skan),
3. poslovni je: `business_profile_id` = odabrana tvrtka, ILI `project_id` vodi na projekt
   te tvrtke, ILI `owner_funding_choice` nije prazan — u bazi postoje točno dvije
   vrijednosti: `material` (6 redaka) i `owner_loan` (2), obje znače „vlasnik platio za firmu",
4. `date` unutar odabranog mjeseca. Trošak bez datuma ne postoji (stupac je obvezan).

Stvarno stanje slika (troškovi bez brisanja): 47 sa slikom — 27 nosi putanju u spremniku
`receipts` (52 objekta u spremniku), 22 nose `local:` (slika je na uređaju, ne u oblaku),
2 nose punu poveznicu. Posljedica za ZIP: slika iz oblaka uvijek se dohvati; `local:` slika
dohvatljiva je samo na uređaju na kojem je snimljena (`LocalFileCache` / `localStorage`,
isti put koji već koristi pregled transakcije). Kad slike nema, trošak ide u popis
„bez slike — provjeri" i paket se svejedno složi.

## Kategorija i „materijalni trošak"

**(a) Kategorija.** Postojeći `category` je potrošačka kategorija (transport, groceries…) i
ne pokriva knjigovodstvenu podjelu. Najlakše i bez obveze:

- zadano se izvodi — trošak s `project_id` = „pripadnost projektu"; bez projekta = prazno,
- korisnik može u traci predaje jednim dodirom postaviti „alat" ili „osnovna sredstva",
- sprema se u **jedan novi neobavezan stupac** `expenses.accounting_category`
  (`text NULL`, CHECK `project|tool|fixed_asset`). Nije obvezan, ne mijenja nijedan
  postojeći put spremanja troška, ne ulazi u obrazac unosa.

Alternativa bez ijednog stupca (samo izvedeno: projekt → „pripadnost projektu", ostalo
„nerazvrstano") je moguća, ali onda korisnik ne može označiti alat/osnovna sredstva —
a to je bio izričit zahtjev iz F1. Zato preporučujem stupac.

**(b) Materijalni trošak.** Izvodi se, ne sprema:
`owner_funding_choice === 'material'` → da; `'owner_loan'` → ne (to je pozajmica);
prazno → gleda se izvor plaćanja kroz postojeći `isPersonalSourceForProfile`
(privatna kartica/gotovina uz poslovni trošak → da). Owner-loan mehanika se samo čita.

## Što se uklanja s ulaznih računa

- `HandoverBar` s `IncomingInvoicesPanel` (traka predaje),
- F1 blok u `InvoiceRow.tsx`: izbor kategorije, izbornik projekta, značka „materijalni trošak",
  te pripadni `setAccountingCategory` put u `useIncomingInvoices`.

Stupci `accounting_category`, `accounting_category_source`, `accounting_category_set_at`
i `project_id` na `incoming_invoices` **ostaju prazni, ne brišu se**. Brisanje stupca je
rušeća promjena nad tablicom koju objavljena aplikacija i dalje čita; prazan stupac ne
škodi ničemu i ostavlja put natrag ako se predomisliš.

## Gdje u aplikaciji

Traka „Predaja knjigovodstvu" seli na **Poslovno → Transakcije** (`BusinessTransactions.tsx`),
iznad popisa: izbor mjeseca (◀ rujan 2026 ▶), broj troškova u paketu, gumbi **PDF**,
**Excel**, **ZIP originala** i **Označi kao predano**. Vidljiva samo kad aktivna tvrtka ima
uključen prekidač `accounting_handover_enabled` (prekidač ostaje gdje jest).

## Izlazi

Isti kao dosad, samo s novim izvorom:

- PDF i Excel — postojeći `handoverPdfExport` / `handoverExcelExport`, redak nosi
  trgovca (`merchant_name`), opis, datum, osnovicu/PDV (`vat_amount`, `vat_rate`; bez njih
  „nerazvrstano"), ukupno (`amount`), način plaćanja (`payment_source`), kategoriju,
  projekt i oznaku „materijalni trošak".
- ZIP originala — slika iz `receipt_url` se očisti u sken (`scanCleanup`: izrez, ujednačeno
  svjetlo, zadano crno-bijelo) i pretvori u PDF; nazivi datoteka poklapaju se s popisom
  (redni broj + trgovac + iznos), uz `popis.txt`.
- Status „predano" — postojeća tablica `accounting_handover_periods` (tvrtka + `YYYY-MM`),
  bez ijedne izmjene sheme.

## Greške

Pad čitanja/upisa → `logDiagnostic` (radnja, id troška/tvrtke i razdoblje, doslovan
`code`/`message`, build žig) + prevedena poruka kroz `describeDbError`, nikad generička.
Problematični troškovi se izlistaju: „bez slike — provjeri", „neuspjela obrada — provjeri".
Paket se uvijek složi za ostale.

## Tehnički dio

- `src/lib/eracun/handoverPackage.ts` → preseljeno u `src/lib/accounting/handoverPackage.ts`:
  `isHandoverExpense`, `selectHandoverExpenses`, `vatRecap`, `groupHandoverExpenses`,
  `packageTotals`. `HandoverRowView` / `HandoverReportData` ostaju isti oblik, pa PDF/Excel
  rade bez izmjene osim naziva stupaca.
- `handoverZipExport.ts` + `scanCleanup.ts` — izvor postaje `receipt_url` (oblak ili `local:`
  kroz postojeći čitač), bez novih knjižnica (`jszip` i `jspdf` već postoje).
- Nova `useHandoverExpenses(businessProfileId, period)` — čitanje troškova za paket
  (samo SELECT, postojeći RLS).
- `HandoverBar.tsx` — prilagodba propova i treći gumb ZIP; seli u `BusinessTransactions`.
- Uklanjanje: traka i F1 blok s `IncomingInvoicesPanel.tsx` / `InvoiceRow.tsx` /
  `useIncomingInvoices.ts`.
- Jedna additivna migracija: `expenses.accounting_category` (nullable + CHECK).
- i18n `hr/en/de`; testovi: odabir skupa (slika, poslovnost, razdoblje, izuzeti eRačun),
  izvedena kategorija i „materijalni trošak", nazivi datoteka u zipu, ponašanje bez slike.

## Izvan opsega — ne dira se

Mail knjigovođi, motor salda i anchor, put spremanja/unosa troška (samo se čita), scanner
tijek, uvoz izvoda, dedup/otisak, owner-loan mehanika, postojeće RLS politike, atribucija
troška, `client.ts`, `.env`. Ne objavljuje se.
