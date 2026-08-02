# Sati u profitu projekta — uskladiti P&L s onim što je stvarno plaćeno

## Odgovor na pitanje 1: da, isplata rada stvara zapis u `expenses`

Provjereno u živoj definiciji `public.create_worker_payout`: funkcija u istoj transakciji
prvo ubacuje redak u `expenses` (`type='expense'`, iznos = `p_paid_amount`, `project_id`,
`category='other'`, opis „Isplata: ime"), zatim redak u `project_worker_payouts` s
`expense_id`, pa `UPDATE expenses SET worker_payout_id = <payout>`. Veza je dvosmjerna.

Znači: **plaćeni rad je u `expenses`**, neplaćeni nije. Zato formula
`materialCost = max(0, expenses − labor − collab)` i postoji — da isti novac ne uđe dvaput.

Provjera na produkcijskim podacima (5 isplata, 4 projekta s radom):

| Projekt | expenses | isplate u expenses | labor (svi sati) | od toga neisplaćeno | material danas |
|---|---|---|---|---|---|
| Duje i Dunja | 29.348,77 | 1.308,00 | 7.642,00 | 6.334,00 | 21.706,77 |
| Lucija i Mate Č. | 10.660,14 | 56,00 | 616,00 | 560,00 | 10.044,14 |
| Solin | 159,63 | 0 | 224,00 | 224,00 | 0 (clamp) |
| Radiona i ostalo | 0 | 0 | 42,00 | 42,00 | 0 (clamp) |

Ukupno 81 od 104 radna unosa nema `payout_id` (657 neisplaćenih sati).

Bitno za formulu: `laborCost` se računa iz svih sati, a `materialCost` oduzima taj isti
iznos od `expenses`. Zbroj ostaje točan **samo dok je `expenses ≥ labor + collab`**:
tada `totalCosts` ispadne točno jednak `totalExpenses`. Kod Solina i Radione uvjet ne
vrijedi — `max(0, …)` reže materijal na nulu, pa `totalCosts` (224 odnosno 42) **premašuje
stvarno potrošen novac** (159,63 odnosno 0). Radiona pokazuje cash saldo −42 € iako na
projektu nije potrošeno ništa.

Dakle imamo dvije različite pogreške ovisno o projektu:
- veliki projekti: ukupni iznos slučajno točan, ali **razrada laže** — neisplaćeni rad je
  tiho premješten iz „Materijalni troškovi" u „Radna snaga" (kod Duje i Dunje 6.334 €),
- mali projekti: **i ukupni iznos laže** jer clamp probije identitet.

## Odgovor na pitanje 2: kartica danas nije ni cash ni accrual — preporuka je A

Lijeva kolona kartice doslovno piše „Trenutno stanje (gotovina)". Ulaz u nju je
`totalIncome − (labor + collab + material)`, gdje je labor obračunski, a collab i material
gotovinski. To je hibrid, a ne jedan ni drugi model.

**Preporuka: varijanta A (cash), s neisplaćenim radom kao zasebnom otvorenom stavkom.**
Razlozi, redom po težini:

1. Vlasnikovo pravilo je „knjiži ono što je odlučeno i plaćeno". Trošak po fazi već radi
   tako (isključivo `expenses`), a korak E ide u istom smjeru — nepotvrđeni trošak ne ulazi.
   A vraća P&L u isti model; B trajno zadržava dva različita modela na istom projektu.
2. Samo A uklanja clamp. U B varijanti Solin i Radiona i dalje prikazuju trošak veći od
   potrošenog novca, jer accrual bez upisa neisplaćenog rada u `expenses` nema odakle
   povući protustavku. B bi zapravo tražio i treću stavku (obveza prema radnicima) da bi
   bio konzistentan — to je veći zahvat od A, ne manji.
3. Ostatak podataka je već cash: suradnici se broje po `paid_amount`, prihod po naplati.

Što se mijenja u brojkama koje korisnik danas vidi (A):

- `laborCost` = zbroj isplata (nedeleted isplatni `expenses`), ne svi sati.
  Duje i Dunja 7.642 → 1.308; Lucija 616 → 56; Solin 224 → 0; Radiona 42 → 0.
- `materialCost` = `expenses − isplaćeni rad − collab`, bez clampa.
  Duje i Dunja 21.706,77 → 23.140,77; Lucija 10.044,14 → 10.604,14; Solin 0 → 159,63.
- **Cash saldo i „Svi troškovi" ostaju nepromijenjeni kod Duje i Dunje i Lucije** (identitet
  `totalCosts = totalExpenses`), a **ispravljaju se kod Solina (+64,37) i Radione (+42,00)**.
- Novo: „Neisplaćeni rad" kao zasebna otvorena stavka (6.334 / 560 / 224 / 42 €), izvan
  zbroja troškova, s brojem sati.
- Očekivani profit prema ugovoru raste za iznos neisplaćenog rada, pa uz njega ide
  napomena da neisplaćeni rad tek predstoji.

## Usput nađeno (odluka potrebna)

`useProjectProfitLoss` dohvaća `expenses` bez filtra na `deleted_at`. U produkciji je
7 obrisanih projektnih redaka u ukupnom iznosu 103,36 €, od čega 3 nastala storniranjem
isplata (`status='voided'`). Ti iznosi danas ulaze u `totalExpenses`. Predlažem dodati
`.is('deleted_at', null)` u istom zahvatu, jer bez toga bi nova `laborCost` iz isplata
brojala i stornirane isplate. To dira samo čitanje, ne podatke.

## Gdje se `laborCost` / `materialCost` koriste

Cijeli obuhvat, provjeren pretragom po `src`, `supabase`, `docs`:

- `src/lib/projectProfitLoss.ts` — jedini izračun.
- `src/lib/projectLaborCost.ts` — dijeljeni helper za sate (koristi ga i
  `useWorkerEarningsPreview` / `MyWorkerPayCard`; **ne dira se**, on prikazuje zaradu
  radnika, a ne trošak projekta).
- `src/hooks/useProjectProfitLoss.ts` — dohvat.
- `src/components/projects/ProjectProfitLossCard.tsx` — kartica, jedini UI potrošač.
- `src/components/projects/ProjectFullScreenView.tsx` — ugrađuje karticu.
- `src/lib/projectFinancePdfExport.ts` — PDF „Profitabilnost (P&L)", redci Radna snaga /
  Materijalni troškovi / ukupno.
- `src/i18n/locales/{hr,en,de}.json` — ključevi.
- Testovi: `projectProfitLoss.test.ts`, `projectLaborCost.test.ts`,
  `projectFinanceUnified.test.ts`.

**Nijedna edge funkcija, MCP ruta ni dashboard ne koriste ove veličine** — nema pogodaka
u `supabase/functions`. Zahvat je time zatvoren u frontend + PDF.

## Djelomično isplaćeno razdoblje

Isplata nosi `status` (`paid`, `partial`, `advance`, `voided`), `gross_amount` (obračunato)
i `paid_amount` (plaćeno), a pokriveni unosi dobiju `payout_id`. Ponašanje:

- **A:** u trošak ulazi `paid_amount` (jer je to iznos u `expenses`). Manjak
  `gross − paid` ostaje u otvorenoj stavci, pa se neisplaćeni rad računa kao
  „svi sati po `rate_at` − isplaćeno", ne kao „sati bez `payout_id`". Time je i predujam
  (`advance`, sati 0 uz plaćeni iznos) pokriven bez negativnih vrijednosti; otvorena
  stavka se floora na 0.
- **B:** trošak se ne mijenja (svi sati), a otvorena stavka je isti iznos
  `sati − isplaćeno`. Razlika je samo u tome ulazi li obračunati dio u zbroj troškova.

Stornirane isplate (`voided`, obrisani `expenses` redak) ne ulaze ni u trošak ni u pokriće —
to je izravno vezano uz `deleted_at` filtar gore.

## Testovi

- Regresija na današnje brojke: fixture po sva četiri produkcijska projekta s očekivanim
  vrijednostima prije i poslije, uz izričitu tvrdnju da cash saldo Duje i Dunje i Lucije
  ostaje isti, a Solinu i Radioni se ispravlja.
- Identitet `laborCost + collaboratorCost + materialCost === totalExpenses` bez clampa —
  test koji pada ako se clamp vrati.
- `materialCost` nikad negativan uz uredne podatke; ako ispadne negativan, to je znak
  isplate izvan `expenses` — test to prijavljuje eksplicitno, ne prikriva `max(0, …)`.
- Djelomična isplata: gross 300 / paid 100 → trošak 100, otvoreno 200.
- Predujam: sati 0 / paid 150 → trošak 150, otvoreno 0 (ne −150).
- Stornirana isplata se ne broji ni u trošak ni u pokriće.
- Bez ijedne isplate: trošak rada 0, sve sate u otvorenoj stavci.
- PDF izvoz: novi redak otvorene stavke izvan zbroja, zbroj i dalje jednak `totalExpenses`.

## Rizici

- **Dvostruko brojanje** — glavni rizik. Nastaje ako se isplaćeni rad izvede iz sati
  umjesto iz isplatnih `expenses` redaka. Zato je izvor `expenses.worker_payout_id`
  (nedeleted), a materijal je ostatak istog skupa — isti novac fizički ne može ući dvaput.
  Pokriveno testom identiteta.
- **Isplata izvan RPC-a.** Ako netko ručno unese trošak isplate bez `worker_payout_id`,
  on pada u materijal, a rad ostaje otvoren. Ne rješavamo u ovom koraku; test negativnog
  materijala i otvorena stavka to čine vidljivim umjesto da tiho pomakne brojke.
- **Razilaženje s troškom po fazi** — A ga smanjuje, ne povećava: oba ekrana onda gledaju
  isti `expenses`. Ostaje razlika u obuhvatu (faze dijele po fazi, P&L ne), što je namjerno.
- **Percepcija** — vlasniku profit optički raste za neisplaćeni rad. Ublažava se time da
  otvorena stavka stoji odmah uz cash saldo i ulazi u PDF.
- **Korak E** — pending i rejected troškovi već su isključeni preko `status` filtra u
  `isCountedTx`; A ne mijenja taj filtar.

## Tehnički sažetak

1. `useProjectProfitLoss`: u `expenses` select dodati `worker_payout_id` i
   `.is('deleted_at', null)`; dohvatiti `project_worker_payouts`
   (`paid_amount, gross_amount, status`) i `payout_id` na radnim unosima.
2. `projectProfitLoss.ts`: `laborCost` = zbroj nedeleted isplatnih `expenses`;
   `materialCost = totalExpenses − laborCost − collaboratorCost` bez clampa;
   novo polje `unpaidLaborCost` (+ `unpaidHours`) izvan `totalCosts`.
3. `ProjectProfitLossCard.tsx`: „Radna snaga (isplaćeno)" u razradi, nova stavka
   „Neisplaćeni rad" vizualno odvojena od zbroja, uz sate.
4. `projectFinancePdfExport.ts`: isti redak u izvozu, izvan zbroja.
5. i18n ključevi u hr/en/de.
6. Ne dira se: trošak po fazi, motor salda, korak E, čitanja iz A/D2, prava pisanja iz D,
   iznosi na fazama, ugovorena vrijednost, `projectLaborCost.ts`, postojeći podaci.
