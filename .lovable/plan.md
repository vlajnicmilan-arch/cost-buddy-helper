# Datum i iznos transakcije iz teksta izvoda, ne iz AI-prijepisa

## Uzrok (provjereno)
`parse-pdf-statement/index.ts` uzima `date`/`amount` iz AI odgovora (r. 818–850), pa ih tek provjerava brana (`guardStatementDates`, r. 860–862). Sirovi tekst se koristi tek POSLIJE brane, i to samo za citat (`matchRawLines`, r. 896–915). Zato AI-datum `2026-04-14` bude blokiran i redak nestane, iako u `extracted_text` doslovno piše `14.09.2026.` uz `19,16`.

Sparivanje u `matchRawLines` koristi datum kao pojačanje (`dateTokens`), ali sidro je iznos — pa se preuzimanje datuma može napraviti bez oslanjanja na AI-datum.

## Novi modul (izdvajanje + nova logika)
`supabase/functions/_shared/statement/valueFromText.ts` — čist modul, bez mreže, vlastiti testovi:

- `parseLineDate(line)` — svi datumski oblici s izvoda: `dd.mm.yyyy.`, `d.m.yyyy`, `yyyy-mm-dd`, `dd/mm/yyyy`, hrvatski riječni (`9. kol 2026.`). Vraća ISO ili `null`.
- `lineDates(line)` — svi datumi u retku redom (Erste ima datum obrade i datum valute, često isti).
- `applyTextValues(lines, txs, period)` — za svaku transakciju:
  1. kandidati = neiskorišteni retci koji sadrže iznos (postojeći `amountTokens` + provjera granica iz `rawLineMatch`; `lineHasAmount` se izvozi, bez promjene ponašanja),
  2. **AI-datum se NE koristi kao filtar** — sparivanje ovisi samo o iznosu, jednoznačnosti i poretku,
  3. ako je kandidat točno JEDAN → uzima se njegov datum: prvi datum u retku; ako redak nosi više različitih datuma i postoji razdoblje, bira se onaj koji pada u razdoblje (inače prvi),
  4. više kandidata istog iznosa → nejednoznačno, ništa se ne preuzima,
  5. redak se troši (kao u `matchRawLines`), pa dvije jednake uplate ne uzmu isti redak.
  Izlaz po transakciji: `{ date, dateSource: 'statement_text' | 'ai', matchedLine }`.

Iznos je sidro sparivanja pa se time i potvrđuje; iznos iz teksta se **ne prepisuje** (ne mijenjamo predznak/tip koji AI daje) — potvrda se bilježi kao `amount_confirmed_by_text: true`.

## Promjene u `parse-pdf-statement/index.ts`
1. Nakon normalizacije (r. 850), a PRIJE brane: ako `sourceLines.length > 0`, pokrenuti `applyTextValues`. Preuzeti datum nadjačava AI-datum; svaka transakcija dobiva `date_source` (`statement_text` | `ai`) i, kad je datum promijenjen, `date_from_ai` (original, za dijagnostiku).
2. Brana ostaje nepromijenjena u logici, ali radi samo nad retcima s `date_source === 'ai'`; retci iz teksta prolaze po definiciji (prosljeđuju se uz branu bez provjere).
3. **Nema tihog gubitka**: blokirani redci više se ne izbacuju iz `transactions`, nego ostaju označeni `date_needs_review: true`, `date_block_reason: 'outside_statement_period'`, `date_original`, uz razdoblje. `date_guard.blocked` u odgovoru ostaje kakav jest (dijagnostika i dalje piše `statement_date_blocked`).
4. Bez tekstualnog sloja (`sourceLines` prazan, skenovi) → nijedan korak se ne pokreće, AI put nepromijenjen.
5. `matchRawLines` (citat) ostaje na svom mjestu i radi kao dosad — sada s točnim datumom, pa mu je posao lakši.

## Klijent
- `src/hooks/usePDFParser.ts`: propustiti nova polja (`date_source`, `date_needs_review`, `date_block_reason`, `date_original`) kroz `toParseResult`; tipovi u `ParsedPDFTransaction`.
- `src/components/pdf-import/GlobalPDFImportHost.tsx`: „prazan izvod" (`toasts.pdfNoTransactions`) pali se samo kad je stvarno 0 pročitanih redaka — što sad i vrijedi, jer blokirani redci ostaju u nizu.
- Pregled uvoza: redak s `date_needs_review` nosi vidljivu oznaku „Provjeri datum" i **nije unaprijed označen za uvoz**, pa ne može tiho ući u knjige; korisnik ga svjesno ispravlja/uključuje. Nove fraze → i18n hr/en/de (postojeći ključevi se ne diraju).

## Testovi
`src/test/statementValueFromText.test.ts`:
- (a) živi slučaj: AI `2026-04-14`, redak `14.09.2026. … 19,16`, razdoblje 14.09. → datum `2026-09-14`, redak ostaje;
- (b) postojeći Erste/OTP/KEKS/Revolut fixture-i: datumi i iznosi nepromijenjeni gdje je AI bio točan;
- (c) bez tekstualnog sloja → izlaz identičan ulazu (AI put);
- (d) dva retka istog iznosa → ništa se ne preuzima, ostaje AI-datum + brana; blokiran redak vidljiv, ne izgubljen.
Uz to postojeći `statementDatePeriodGuard`, `statementRawLine`, `statementSegmentation` i cijeli paket + `bunx tsgo`.

## Što se NE dira
Klasifikacija izvod/račun, čitanje zaglavlja (banka, IBAN, razdoblje, završno stanje), motor salda i poravnanja, dedup/otisak (`computeImportFingerprint`), `business_debts`, atribucija, RLS, sken računa, trust-level, javno sučelje uvoza. Bez objave.

## Izdvojeno vs promijenjeno
- Izdvojeno bez promjene ponašanja: izvoz `lineHasAmount`/`amountTokens` iz `rawLineMatch.ts` za ponovnu upotrebu.
- Funkcionalno novo: `valueFromText.ts`, preuzimanje datuma iz teksta, zadržavanje blokiranih redaka s oznakom umjesto brisanja.
