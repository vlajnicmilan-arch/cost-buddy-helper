# Korak F — „Marža" i „Zarada" prestaju lagati

## Prvo: tri stvari iz repozitorija koje mijenjaju opseg

**1. Planirani trošak faze je prazan na cijeloj produkciji.**
Upit nad `project_milestones` (bez obrisanih): 54 faze na tri projekta, od toga **0 faza ima `budget`**. `investor_price` postoji: Duje i Dunja 28/28 faza, zbroj 41.778,65 (potvrđuje vašu brojku), Lucija i Mate 1/9 faza (2.900,00), Solin 0/17.
Posljedica: planirana marža (točka 2) i pragovi vezani na planirani trošak (točka 3) danas se **neće prikazati ni na jednom projektu**, dok vlasnik ne počne upisivati trošak po fazama. To nije greška plana — to je stvarno stanje podataka nakon koraka B. Gradimo mehanizam, ne očekujemo trenutni vizualni učinak.

**2. `total_budget` je zaseban i neusklađen podatak, ne alias ugovorenog.**
Duje i Dunja: `contract_value` 42.333,52, `total_budget` 30.000. Solin i još tri projekta imaju `total_budget = 0`. Pritom `total_budget` danas nije samo prikaz — on je ulaz u `calculateProjectHealth` (komponenta „budget", 30–40 % ocjene) i pogoni traku iskorištenosti na `ProjectCard`. Micanje s prikaza znači i odluku što s tom komponentom ocjene.

**3. Preimenovanje samo natpisa ostavlja laž u susjednom tekstu.**
Boje, semafor i AI upozorenja koriste iste brojke pod imenom marže: „Zdravo: marža iznad 30 %", „Marža kritična · {{pct}} %", `projects.marginStatus.*`, `issueDetection` („projekt u zoni gubitka" kad je `(contract − spent)/contract < 10 %`). Ako se broj preimenuje u „Preostalo", ti pratећi tekstovi moraju ići s njim, inače kartica kaže „Preostalo 90 %" i odmah ispod „marža zdrava".

---

## 1. Popis svih mjesta gdje se danas prikazuje taj broj

| Mjesto | Datoteka | Što prikazuje danas |
|---|---|---|
| Dashboard, traka aktivnih projekata | `src/components/home/ActiveProjectsStrip.tsx` | veliki postotak „MARŽA" = `(contract − spent)/contract`; footer redak „Zarada" = `contract − spent`; semafor `healthFromMargin` (30/10 %) |
| Status-rečenica ispod kartice | `src/lib/projectStatusLine.ts` | grane „Stabilan", „Pripremna faza · X % budžeta", „Pred kraj · preostalo X %" — ulaz je isti `margin` |
| Detalj projekta, tab Budžet | `src/components/projects/ProjectBudgetTab.tsx` | KPI „Marža" + status točka; ulaz `marginPct` iz `ProjectFullScreenView.tsx` (linija 366) |
| Detalj projekta, Earned Value | `src/components/projects/ProjectEarnedValueCard.tsx` | „Marža" (iznos) i „Marža %" iz `projectHealthScore.marginAmount / marginPct` |
| Ocjena zdravlja | `src/lib/projectHealthScore.ts` | `marginPct = (contract − spent)/contract`, 40 % težine ocjene |
| Biznis pregled projekata | `src/components/business/BusinessProjectsOverview.tsx` | „Marža X %" i „Zarada" iz `(budget − spent)` |
| Kartica u listi projekata | `src/components/projects/ProjectCard.tsx` | nema natpisa „Marža", ali traka „Iskorišteno" i zdravlje dolaze iz iste logike |
| Detekcija problema / alarm | `src/lib/issueDetection.ts`, `src/hooks/useProjectLossZoneAlert.ts` | „zona gubitka" kad je preostalo < 10 % |
| Prognoza | `src/components/projects/ProjectForecastCard.tsx` | `marginStatus(forecastMarginPct)` |
| PDF Earned Value | `src/lib/projectFinancePdfExport.ts` (`exportEarnedValuePdf`) | retci „Marza" i „Marza %" |
| PDF izvještaj projekta | `src/lib/projectReportExport.ts` | „Ocekivani profit (X %)" |
| MCP | `.lovable/mcp/manifest.json`, `src/lib/mcp/index.ts` | alat za projekte vraća prihod/rashod/`profit` iz transakcija (gotovinski) — **ne** `contract − spent`. Ovdje nema laži i ne dira se, osim opisa ako se pokaže dvosmislen |

P&L kartica (`ProjectProfitLossCard`) i njezin PDF ostaju netaknuti — oni su već gotovinski i imenovani točno.

## 2. Preimenovanje

Novi par natpisa za **otvorene** projekte (`draft`, `active`, `paused`, `cancelled`):
- „Marža" → **„Preostalo"** (`projects.card.remainingPct`)
- „Zarada" → **„Neutrošeno"** (`projects.card.unspent`)

Za `status = 'completed'` isti izračun zadržava „Ostvarena marža" / „Zarada" (`projects.card.realizedMargin`, `projects.card.realizedProfit`).

Izbor imena rješava jedan pomoćnik, `src/lib/projectMetricLabels.ts`:

```text
getRemainderLabels(status) -> { pctKey, amountKey, isRealized }
```

Sva mjesta iz tablice zovu njega; nijedna komponenta ne odlučuje sama. Isti pomoćnik pokriva i pratеće tekstove (semafor, `marginStatus`, AI upozorenja, `statusLine`), da se ne dogodi „Preostalo 90 % / marža zdrava".

Prijevodi hr/en/de: hr „Preostalo" / „Neutrošeno" / „Ostvarena marža"; en „Remaining" / „Unspent" / „Realized margin"; de „Verbleibend" / „Nicht ausgegeben" / „Erzielte Marge". Stari ključevi ostaju u datotekama dok se svi potrošači ne prebace, pa se brišu u istom koraku.

## 3. Planirana marža projekta (zbroj po fazama)

Novi čisti modul `src/lib/projectPlannedMargin.ts`, izgrađen nad postojećim `sumVisibleAmounts` iz `src/lib/milestoneAmounts.ts` (već razlikuje „skriveno/neupisano" od nule).

```text
computeProjectPlannedMargin(milestones) -> null | {
  plannedCost, plannedPrice, plannedMarginAmount, plannedMarginPct,
  covered: { withBoth, total }, partial: boolean
}
```

**Pravilo za djelomične podatke.** Zbrajaju se **samo faze koje imaju oba iznosa** (`budget` i `investor_price` različiti od `null`). Rezultat se vraća samo kad je takvih faza barem jedna; inače `null` i ništa se ne prikazuje — nikad 0 %.
Obrazloženje: marža je omjer dvaju zbrojeva. Ako se u brojnik uzmu cijene svih faza, a u nazivnik troškovi samo nekih, postotak je izmišljen i uvijek previsok. Uzeti prazan trošak kao 0 znači tvrditi „ova faza je čista zarada", što je najgori mogući smjer pogreške. Zato je jedinica zbrajanja **faza s parom**, a ne pojedino polje.

Kad je `withBoth < total`, iznad brojke stoji tiha napomena „temeljeno na {{withBoth}} od {{total}} faza" — brojka je istinita za ono što pokriva i sama kaže koliko pokriva. Faze koje uloga ne smije vidjeti već dolaze kao `null` iz `project_milestones_scoped`, pa ispadaju iz zbroja istim putem; investitor i radnik zbog toga ne dobivaju novi kanal prema marži.

Planirana marža je **snimka faza** i ne miješa se s ugovorenom vrijednošću — vidi pravilo niže.

## 4. Napomena o nerazvrstanom iznosu

`unclassified = contract_value − Σ investor_price` (samo prikaz, nikad ulaz u izračun).
Prikazuje se kao tiha rečenica u sivom, bez ikone upozorenja i bez boje, samo kad postoji barem jedna faza s cijenom i kad je razlika po apsolutnoj vrijednosti veća od 0,01. Tekst: „Ugovoreno {{contract}} · po fazama razvrstano {{phases}} · nerazvrstano {{diff}}". Negativna razlika (zbroj faza veći od ugovorenog) dobiva istu rečenicu s drugim predznakom, i dalje bez alarma. Duje i Dunja: 42.333,52 / 41.778,65 / 554,87.

## 5. Pragovi zdravlja bez grananja na pet mjesta

Danas su pragovi rasuti: `ActiveProjectsStrip.healthFromMargin` (0,30 / 0,10), `ProjectFullScreenView` linija 373–377 (`costPct >= 80`), `projectHealthScore.marginScoreFromPct` (5/15/30), `issueDetection` (10 %), `useProjectLossZoneAlert` (90 %).

Uvodi se jedan pojam — **osnovica za pragove** — u `src/lib/projectCostBaseline.ts`:

```text
getCostBaseline(project, milestones) ->
  { value, source: 'planned_cost' | 'contract' | 'none' }
```

- `planned_cost` kad Σ `budget` po fazama > 0 (nove, oštrije granice: žuto na 80 % planiranog troška, crveno preko 100 %)
- `contract` kad planiranog troška nema (današnje ponašanje, nepromijenjeno)
- `none` kad nema ni ugovorenog — nema pragova, nema boje

Svako od pet mjesta prelazi na `getCostBaseline` + zajednički `getHealthLevel(spent, baseline)`; grananje `planned_cost` vs `contract` postoji **samo unutar** te dvije funkcije. Prag ostaje 80/100 — mijenja se ono na što se 80 % odnosi, a ne broj. `projectHealthScore` zadržava svoju strukturu ocjene, ali `budgetUsedPct` računa iz osnovice umjesto iz `total_budget`.

## 6. Odnos prema `total_budget`

Prijedlog: **maknuti ga s prikaza, zadržati u bazi.**
- s korisničkog sučelja nestaje kao zaseban KPI i kao nazivnik trake „Iskorišteno" na `ProjectCard` (zamjenjuje ga osnovica iz točke 5);
- ostaje kao **posljednji fallback** u `calculateContractValue`, jer ga koriste stari projekti bez `contract_value` (Eda Zg, Milan) i `applyContractAmendment`;
- stupac se **ne** briše i podaci se ne diraju — nikakva migracija.

Time nestaje dvoznačnost „30.000 ili 42.333,52", a nijedan postojeći projekt ne ostaje bez brojke.

## Pravilo koje se ne smije prekršiti

Ugovorena vrijednost je knjiga (osnovica + aneksi, s tragom preko `project_contract_amendments`). Zbroj cijena po fazama je snimka. Njih dvoje **nikad ne ulaze u isti izračun** i zbroj faza se **nikad ne pribraja** ugovorenoj vrijednosti. Kod Duje i Dunje aneksi već čine 13.945,52 od ugovorenih 42.333,52 — pribrajanje faza bilo bi dvostruko brojanje.

Provedba u kodu: `projectPlannedMargin.ts` prima **samo** faze, bez pristupa projektu; `getCostBaseline` prima projekt i faze, ali ih koristi kao **alternative** (`source`), nikad kao pribrojnike. Jedina točka gdje se oba pojma pojavljuju zajedno je oduzimanje iz točke 4, koje je čisti prikaz.

## Testovi

Vitest, novi `src/lib/__tests__/projectPlannedMargin.test.ts` i `projectCostBaseline.test.ts`:
1. sve faze s parom → planirana marža točna; nijedna s parom → `null` (ne 0 %);
2. djelomično pokriće → računa se samo iz faza s parom, `covered` javlja 1/9 (slučaj Lucija i Mate);
3. skriveni iznosi (`null` iz scoped pogleda) ne postaju 0;
4. cijena 0 ili negativna → bez postotka;
5. **zabrana pribrajanja**: za Duje i Dunja (ugovoreno 42.333,52, Σ cijena 41.778,65) tvrdi se da nijedan izlaz nije 84.112,17 i da `plannedPrice` nikad ne ovisi o `contract_value` — test pada ako netko uvede zbrajanje;
6. nerazvrstani iznos = 554,87, s pozitivnim i negativnim smjerom;
7. osnovica: `planned_cost` kad postoji Σ trošak, `contract` kad ne postoji, `none` kad nema ničega; pragovi 80/100 na svakoj od njih;
8. natpisi: otvoren projekt → „Preostalo"/„Neutrošeno", `completed` → „Ostvarena marža"/„Zarada";
9. i18n: novi ključevi postoje u hr/en/de (postojeći test potpunosti prijevoda).

SQL paket (balance, role write matrix, SECDEF invarijanta) pokreće se nepromijenjen kao regresija — korak F ne dira bazu, pa se očekuje isti rezultat.

## Rizici

- **Osobni mod.** `ActiveProjectsStrip` se u osobnom modu prikazuje; faze ondje često nemaju iznose, pa će osnovica biti `contract`, a planirane marže neće biti. Nova imena („Preostalo") ipak vrijede i ondje — što je i cilj.
- **Projekti bez ijednog iznosa** (Solin, dva prazna „Milan"): osnovica `none`, bez pragova i bez boje, umjesto današnjeg tihog nule-ponašanja. Postojeći poziv „Postavi ugovoreni iznos" ostaje jedini sadržaj kartice.
- **Prazan planirani trošak na cijeloj produkciji** (nalaz 1): nakon isporuke vlasnik neće vidjeti razliku dok ne upiše troškove po fazama. Treba to reći unaprijed da se izostanak brojke ne pročita kao kvar.
- **Zaoštreni pragovi.** Čim se upiše planirani trošak, projekti koji su danas zeleni prelaze u žuto ranije. To je namjera, ali je vidljiva promjena ponašanja.
- **Ocjena zdravlja** se pomiče jer `budgetUsedPct` mijenja nazivnik; brojka „X/100" na Earned Value kartici neće biti ista kao jučer.
- **Uloge.** Planirana marža izvedena je iz `project_milestones_scoped`, pa nasljeđuje zaštitu iz koraka A i D2. Rizik bi nastao samo ako bi se zbroj računao na neskopiranom izvoru — testovi 3 i 5 to čuvaju.

## Ne dira se

Motor salda, korak E (troškovi na potvrdu), čitanja iz koraka A i D2, prava pisanja iz koraka D, P&L kartica i njezin PDF, postojeći podaci. Nema migracije baze.
