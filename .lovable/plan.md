# Mail lijevak — previše stvari postaje „račun" (plan, bez izmjena)

Provjereno u živoj bazi (vlasnik d4d31ee6…, 45 dana) i u kodu `mail-process/index.ts` + `_shared/mailImport/classify.ts`.

## Zajednički korijen (B, E, dio A) — potvrđeno

`knownCounterparties()` (mail-process/index.ts, 195–210) puni `knownOibs` iz `incoming_invoices.supplier_oib`. U tim retcima stoji i **vlastiti OIB Akrobata 39916265994 (24 retka)**, Erste 23057039320 (6), FINA 85821130368 (18). Zatim `classify.ts → runClassification`, korak **3b „Heuristika"** (340–379): ako se u tekstu nađe BILO KOJI poznati OIB → **uvijek `classification: 'racun'`, docType 380**, a `supplier_oib = knownOib` (ne prolazi filter vlastitih OIB-a iz `pickSupplierOib`). AI se zove samo kao „dopuna" (`ai_dopuna`) i iz njegovog odgovora uzima se samo `extraction` — `ai.classification` se **odbacuje**. Zato: extraction kaže `nije_za_nas`/`ponuda`, stavka je `racun`.

Dodatno: isti upit čita `eracun_counterparty_iban.oib`, a stupac se zove `counterparty_oib` → taj dio uvijek vraća grešku i tiho je prazan.

## B) AI kaže nije_za_nas → racun
- Mjesto: `classify.ts` 3b (356–378) + `knownCounterparties`.
- Pravilo:
  1. `knownOibs` = poznati OIB-i **minus vlastiti** (`ownOibs`), i nikad banka iz `KNOWN_BANK_NAMES` kad tekst nosi bankovnu obavijest.
  2. Poznat OIB je samo **dokaz izdavatelja**, ne presuda o vrsti. Heuristika smije sama reći `racun` samo ako uz to postoji račun-dokaz (vidi A). Inače ide AI kao puna klasifikacija (korak 4), i njegova presuda `nije_za_nas`/`ponuda` vrijedi.
  3. Kad dopuna ipak ide, a AI vrati drugačiju klasifikaciju → ne gaziti: ići kroz korak 4 grane (tišina / nije_za_nas / ponuda).
  4. Ispravak stupca `counterparty_oib`.
- Uzorci: cc7d46c6, 6d7b3dc4, d2bc254d, 9da246b9, 014d14fa, 16c477b2, cff72aa1.

## E) AI kaže ponuda, stavka racun, dobavljač = vlastiti OIB (340f858b, OTP Leasing)
- Isti korijen: 39916265994 je poznat → 3b → `racun` + `supplier_oib = 39916265994`.
- Pravilo: iz točke B.1 (vlastiti OIB nikad kandidat) + B.2 (klasifikacija ponuda od AI-ja ostaje). Dodatni čuvar: `supplier_oib ∈ ownOibs` nikad se ne upisuje (i nakon `memoryFill`).

## A) Obavijest bez privitka → racun
- Paddle (≈30 stavki, extraction `racun`) nastaje u koraku 4 (AI put, 450–461): AI sam kaže `racun`, nema determinističke provjere. George/NetBanking nastaju kroz 3b (Erste OIB poznat). „Obavijest o primitku dokumenta" i Anthropic „paused" — AI kaže `racun`; Anthropic je sad već hvata Pravilo 3 (`bez_iznosa_i_broja`), ostali ne.
- Predloženo pravilo „račun iz tijela maila" (samo `attachmentId === null`, bez UBL-a): da bi ostao `racun`, tijelo mora imati **iznos + barem jedan dokument-dokaz**: broj računa/narudžbe/rezervacije (`invoice_number`/„Receipt #", „Booking"), ILI naziv izdavatelja + datum + stavke/porez. Plus **veto fraze** obavijesti: „Transaction billed/created/completed", „Transakcija:", „NetBanking", „Obavijest o primitku dokumenta", „subscription … paused", „autorizacija", „rezervacija sredstava".
- Kamo: obavijest o bankovnoj transakciji (George, NetBanking) → `nije_za_nas` s razlogom `obavijest_o_transakciji` (bankovni redak dolazi kroz sinkronizaciju/izvod; bez nove veze). Paddle „Transaction …" → `nije_za_nas` razlog `obavijest_platforme`. FINA „Obavijest o primitku" → `nije_za_nas` (e-Račun dolazi kao UBL zasebno).
- Mjesto: novi čisti helper `_shared/mailImport/notificationSignals.ts`, poziv u `classify.ts` nakon 2c (izjava „nije račun"), prije 3b. Korisnikova klasifikacija jača.
- Moraju ostati `racun`: Meta 40ba3a3e/88ffc86c, Bolt c5cfb45a, Airbnb bc4630e1.

## C) Izlazni račun kao ulazni (3179ac2e)
- Stanje: `supplier_name = TACTURA j.d.o.o.`, `recipient_oib = 33941873288` (= vlastiti profil Tactura). `extractCustomer` pogrešno prepoznaje vlastiti OIB kao kupca, `resolveDestination` ga rutira u Tactura biznis; nigdje nema provjere „izdavatelj = mi". Stvarni OIB kupca (CINDORI) nisam potvrdio iz teksta — prvi korak gradnje je pročitati `extracted_text`.
- Pravilo: ako naziv ili OIB izdavatelja (zaglavlje, „Izdavatelj/Prodavatelj", prvi OIB u zoni izdavatelja — kao `issuerZone` kod izvoda) odgovara vlastitom profilu → `classification: 'izlazni_racun'`, status `nije_za_nas` s razlogom `izlazni_racun`, nikad trošak. Mjesto: `classify.ts` prije 3b + `customerExtract.ts`.

## D) Jedan mail → više stavki
- Lovable (2e861444 + fadd844e, ista poruka): `receiptPairing` radi (`potvrda_uz_racun`, docType `potvrda_placanja`), ali potvrda ostaje zasebna stavka `racun / na_pregledu`; skriva je samo UI (`splitPairedReceipts`). Pravilo: uparena potvrda dobiva `classification: 'potvrda_placanja'`, status `povezan_uz_racun` (ili ostaje s `related_item_id`, ali se ne broji u red ni u značku).
- Alfa lider (13 stavki, message 6ae4c01f, sve `ponuda`): petlja `for (const unit of units)` (index.ts 478–502) pravi stavku po privitku. Pravilo: nakon klasifikacije, ponude iste poruke s istim dobavljačem (OIB/naziv) i istim/praznim brojem ponude → jedna glavna stavka, ostali privici `related_item_id` (`prilog_uz_ponudu`). Računi s različitim brojevima ostaju zasebni (postojeći test „dva različita računa").

## Usput — confidence „niska"
- Polje se upisuje (index.ts 822, 900), ali `lowerConfidence(result.confidence, forcedConfidence)` ga obara na `niska` kad `trustLevel` vrati T4 (`forcedConfidence: 'niska'`, upozorenje `posiljatelj_neprovjeren`) — što imaju sve provjerene stavke. Uz to 3b vraća `srednja`/`niska` neovisno o AI-ju. Nije kvar upisa; to je namjerno obaranje za neprovjerenog pošiljatelja. Prijedlog: ostaviti, ali UI i pravila ne smiju tumačiti `confidence` kao sigurnost klasifikacije — dodati zasebno `extraction.confidence` (AI) u prikaz. Odluka vlasnika.

## Ne smije se pokvariti
Izvodi Erste/OTP/Revolut (veto izvoda ostaje prije svega), e-Računi s FINA-e (UBL put 1. korak, netaknut), HAC, Lovable račun (samo potvrda mijenja status), Meta receipt, Bolt, Airbnb, pravilo „dva različita računa = dvije stavke", Pravilo 2/3 i pamćenje odbijanja.

## Testovi (vitest, doslovni tekst iz stavki)
Gradnja počinje izvlačenjem `extracted_text`/tijela za navedene id-eve u fixture datoteke (samo čitanje).
- `mailNotificationVeto.test.ts`: Paddle ×3 vrste, George, NetBanking, Anthropic paused, FINA obavijest → nije_za_nas; Meta ×2, Bolt, Airbnb → racun.
- `mailKnownOibNoOverride.test.ts`: tekst s vlastitim OIB-om ne pokreće 3b; AI `nije_za_nas`/`ponuda` preživi; supplier_oib nikad vlastiti (340f858b, cc7d46c6, 6d7b3dc4); pravi račun poznatog dobavljača (HAC, FINA račun) i dalje racun.
- `mailOutgoingInvoice.test.ts`: 3179ac2e → izlazni; ulazni račun s našim OIB-om kao kupcem → ulazni.
- `mailOneDocumentOneItem.test.ts`: Lovable par, Alfa lider 13 privitaka → 1 glavna; dva različita računa → 2.
- Postojeći: `mailPaymentReceiptPairing`, `mailInvoiceSignalPriority`, `mailStatementIssuerZone`, `mailBulkSignals`, `mailEnrichmentTokens` moraju ostati zeleni.

## Pravila gradnje (zasebni nalog)
- Postojeće stavke se ne diraju i ne brišu.
- Svaki pad klasifikacije → `app_diagnostics_logs` (code, message, build žig).
- Samo `_shared/mailImport/*` + `mail-process/index.ts` + testovi; bez migracija (osim ako `izlazni_racun`/`povezan_uz_racun` traže novu vrijednost statusa — provjeriti CHECK prije). Deploy samo `mail-process` na izričit nalog.
- Izvještaj: dirnute datoteke i što nije dirano.

## Otvoreno
1. Paddle obavijesti: `nije_za_nas` ili zadržati kao dokaz uplate uz bankovni redak? (Prijedlog: nije_za_nas.)
2. Confidence: ostaviti obaranje za T4 ili prikazivati AI sigurnost?
