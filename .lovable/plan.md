# Jedno pravilo „je li ovo isti trošak" (ručni/slikani ↔ bankovni)

Samo plan. Ništa se ne mijenja dok ne kažeš „gradi".

## Pravilo (jedno, za sva tri puta)

Kandidat prolazi samo ako vrijedi SVE:
- isti vlasnik (`user_id` iz baze, nikad prepisan s retka koji se obrađuje);
- isti novčanik (`resolvePaymentSourceKey`), ista vrsta (expense/income), nije prijenos, korekcija ni avans;
- iznos isti do centa;
- datum: bankovni redak od −1 do +3 dana u odnosu na ručni (jednosmjerno, s tolerancijom od 1 dan unatrag);
- trgovac: `merchant_name` ručnog retka ↔ protustrana banke (rezerva: opis banke) kroz `areMerchantsSimilar`; opis ručnog retka koristi se samo ako nema `merchant_name`; ako nijedna strana nema ime sa značajnom riječi → „nesigurno";
- kartica: različite kartice ne blokiraju ako obje pripadaju istom novčaniku (vidi c).

Ishod: `match` (točno jedan kandidat) | `ambiguous` (≥2, ili jedan kandidat traži više redaka) | `uncertain` (nema imena / ime se ne slaže) | `none`. Automatsko spajanje samo na `match`.

## (a) Datoteke i funkcije

Novi modul (zrcalo po uzoru na `moneyLedgerPlan`):
- `supabase/functions/_shared/sameExpenseRule.ts` + `src/lib/sameExpenseRule.ts`, blok SHARED CORE; `decideSameExpense(target, candidates, cardWallets)` i `isSameExpense(pair)`.
- `areMerchantsSimilar`/`normalizeMerchant` i `stripLeadingBankVerbs` trenutno žive samo u `src/lib`; njihova čista jezgra seli se u SHARED CORE (stare datoteke je dalje izvoze — bez promjene ponašanja, postojeći testovi `duplicateDetection` ostaju zeleni).

Sinkronizacija:
- `_shared/bankSyncDecision.ts` → `pickMergeTarget` postaje tanki omotač oko pravila (uklanja se `normalizeCounterparty(c.description)` i blokada kartice).
- `bank-sync-transactions/index.ts` (upit kandidata ~l.650): dodati `merchant_name`, `user_id`, `payment_source`, `type`; kod `ambiguous`/`uncertain` ne spaja, novi redak ide kao i danas, a razlog se dodaje u postojeći zbirni zapis u `app_diagnostics_logs` (bez iznosa/opisa, samo id-evi i razlog).
- `bankSyncShadow` ostaje; dobiva iste kandidate, jezgra `moneyLedgerPlan` se ne mijenja.

Uvoz izvoda:
- `src/lib/importClassifier.ts`: faza spajanja s ručnim retkom zove pravilo (prozor −1/+3 umjesto `maxDayDiff=1` samo za taj par ručni↔banka). `match` → postojeći `auto_merge` (origin `merchant`); `ambiguous`/`uncertain` → postojeća pitanja na pregledu.
- `src/lib/importReview/lateCardMatch.ts`: ostaje za slučaj „iznos + datum bez imena" kao ponuda; ne dira se logika, samo se isključuju retci koje je pravilo već spojilo.
- `executor.ts`, grane pisanja i `merge_manual_with_bank` SQL: nepromijenjeni.

Ručni unos / slika računa:
- `src/lib/mergeOfferCandidate.ts` → koristi pravilo (dodaje trgovca i karticu; prozor −3/+1 gledano s ručne strane, zrcalno bankovnom).
- `src/hooks/useMergeCandidate.ts` → upit dohvaća i `merchant_name`, protustranu, `payment_source_card_id`.
- `src/hooks/useExpenseCRUD.ts`: bez promjene pisanja; `pending_bank` ostaje kad ponude nema.

## (b) Ponuda spajanja kod ručnog unosa

- Postojeći tok u `AddExpenseDialog` već zove `findMergeCandidate` prije spremanja i prikazuje dijalog duplikata. To se zadržava — nema novog ekrana.
- Kada: nakon „Spremi" (ručno) ili nakon potvrde skeniranog računa, prije upisa. Personal skener je izvor istine; Business koristi isti tok.
- Prikaz: samo kod `match` — dijalog s bankovnim retkom (datum, iznos, trgovac iz banke) i tri radnje: „Spoji s bankovnim", „Spremi kao novi", „Odustani". Kod `ambiguous` ponuda se ne prikazuje (šutnja, kao danas).
- Ako korisnik odbije („Spremi kao novi"): upis kao danas, ali bez `pending_bank` (banka je taj trošak već donijela i neće ga ponovno slati), i taj par se pamti kao odbijen na novom retku samo u memoriji sesije — nema migracije. Nitko ga kasnije neće automatski spojiti.
- Spajanje ide postojećim `merge_manual_with_bank` (nasljeđuje vrijeme banke, saldo se ne mijenja).
- Tekstovi kroz postojeće i18n ključeve; nove oznake samo ako treba, hr/en/de.

## (c) Kartice „istog novčanika"

- Kartica pripada novčaniku preko `payment_source_cards.payment_source_id`.
- Pravilo dobiva mapu `cardId → walletKey` (sinkronizacija: jedan upit po pokretanju za kartice vlasnika; klijent: iz postojećeg dohvaćanja kartica).
- Kartice ne blokiraju ako: jedna od njih nedostaje, ILI su iste, ILI obje pokazuju na isti novčanik kao i sam redak. Blokiraju samo ako bilo koja pripada drugom novčaniku ili je nepoznata u mapi dok druga jest poznata → `uncertain`.
- Token 7246 i fizička 2081 moraju biti vezane na isti novčanik u `payment_source_cards`; prije gradnje upitom provjeriti da je to stvarno stanje kod tog korisnika (nije još provjereno). Ako nisu, rezultat je `uncertain`, ne spajanje.

## (d) Brana — testovi

Fixturei iz stvarnih parova (anonimizirani, bez id-eva korisnika) u `src/test/fixtures/sameExpense/`:
- MORAJU se spojiti: Baustoff 60,96 (ručni 1.8. / banka 3.8., kartice 7246/2081 istog novčanika), Petrol 113,87 (3.8./5.8.), Lignum 126,29 (7.8./9.8.), Baustoff 110,49 (7.8./9.8.), Aleta 7,65 (31.7./2.8.), Oluk 472,40 (banka prije, ručni upisan poslije — ručni tok).
- NE SMIJU se spojiti: Fero-Term / Ribola 5,95 isti dan; Lučko / Rovanjska 17,60 (dva prolaza).

Testovi:
1. `sameExpenseRule.test.ts` — svi fixturei kroz pravilo + rubovi: −2 dana, +4 dana, 1 cent razlike, drugi novčanik, tuđi `user_id`, kartica drugog novčanika, dva kandidata.
2. `sameExpenseRuleMirror.test.ts` — doslovno zrcalo SHARED CORE.
3. Sinkronizacija: isti fixturei kroz `pickMergeTarget` s kandidatima kakve vraća upit; kandidat drugog vlasnika nikad odabran; `bankSyncShadow.test.ts` ostaje zelen.
4. Uvoz: fixturei kroz `classifyImport`; statement fixturei `erste-no-balance` i `keks-identical-rows` — dvostruki uvoz i dalje 0 novih redaka; `ledgerPlanEquivalence` i `indistinguishablePairing` zeleni (očekivane promjene samo gdje pravilo namjerno širi prozor, svaka popisana).
5. Ručni tok: `mergeOfferCandidate.test.ts` proširen (Oluk, dva kandidata → šutnja).
6. SQL paket salda (144) i merge harness zeleni — ne bi se smjeli ni pomaknuti.

## (e) Rizik i podjela

Rizici:
- Lažno spajanje dvaju različitih troškova istog iznosa → ublaženo: ime mora biti slično (≥2 zajedničke riječi ili isto jednorječno ime) + točno jedan kandidat. Najslabija točka: jednorječni generični trgovci (npr. „Petrol" s dva točenja istog iznosa u 4 dana) — tada su 2 kandidata → šutnja.
- Širenje prozora uvoza s 1 na −1/+3 mijenja ishod postojećih uvoza; zato test ekvivalencije popisuje svaku razliku.
- Seljenje `areMerchantsSimilar` u zajednički modul mora biti bez promjene ponašanja.
- Sinkronizacija piše mimo RLS-a: vlasnik uvijek iz baze.
- Nema diranja postojećih redaka, salda, sidra, otiska, prijenosa.

Predložena podjela (4 naloga):
1. Modul pravila + zrcalo + seljenje sličnosti imena + fixturei i testovi pravila. Nitko ga još ne zove.
2. Sinkronizacija: `pickMergeTarget` na pravilo, proširen upit, mapa kartica, razlozi u dijagnostiku; sjena radi.
3. Uvoz izvoda: `importClassifier` na pravilo, popis namjernih razlika.
4. Ručni unos/slika: `mergeOfferCandidate` + `useMergeCandidate`, ponuda i odbijanje; zatim odvojeno (izvan ovog programa) popis starih parova za ručni pregled.

## Otvoreno prije gradnje
- Potvrditi upitom da su kartice 7246 i 2081 u `payment_source_cards` vezane na isti novčanik.
- Potvrditi da li „Spremi kao novi" treba trajno pamtiti odbijeni par (zahtijevalo bi migraciju) ili je dovoljno samo ne postaviti `pending_bank`.
