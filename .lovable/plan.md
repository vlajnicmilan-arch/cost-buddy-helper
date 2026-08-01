# Korak B — dva iznosa na fazi (trošak + cijena investitoru)

## Prvo: četiri neslaganja između zahtjeva i repozitorija

1. **`budget` se u kodu već koristi kao `number | null` u tipu, ali kod ga tretira kao broj.** `src/types/project.ts` (Korak A) već ima `budget: number | null`, a `tsconfig.app.json` ima `"strict": false` — TypeScript zato NE javlja nijednu grešku na `m.budget > 0`, `m.budget + spent`, `formatAmount(m.budget)`. To znači da nas prevoditelj neće upozoriti ni na jedno mjesto; popis mora biti ručni (dolje, točka 2).
2. **Postoji stvarni pad, već danas.** `ProjectMilestonesTab.tsx:115` radi `setBudget(milestone.budget.toString())`. Čim `budget` bude `null` (skriveno ili prazno), otvaranje forme baca `TypeError`. Ovo se mora popraviti u istom koraku, inače shema iz točke 1 ruši formu.
3. **Model tipova projekta NEMA pojam "ima investitora".** `src/lib/projectTypes.ts` nosi samo `icon`, `color`, `labelKeys`, `templateCategory`. Pravilo iz točke 6 zahtijeva novo polje na presetu — prijedlog dolje.
4. **Uloga u komponenti faza trenutno nije dostupna.** `ProjectFullScreenView.tsx` zna `currentUserRole` i `isOwner`, ali `ProjectMilestonesTab` ih ne prima. Vidljivost polja u koraku B **ne smije** se izvoditi iz uloge u komponenti — izvodi se iz **podatka** (`null` iz pogleda = ne prikazuj). To je i sigurnije i točno prati korak A. Iznimka je prazna nova faza (nema podatka), gdje se ionako radi samo o vlasniku jer je pisanje vlasnikovo.

## 1. Migracija baze (jedna, mala)

```
ALTER TABLE public.project_milestones
  ALTER COLUMN budget DROP DEFAULT,
  ALTER COLUMN budget DROP NOT NULL;
```

Postojeći redovi se ne diraju (nule ostaju nule). `investor_price` je već nullable. Nakon migracije se regeneriraju Supabase tipovi, pa i pogled `project_milestones_scoped` vraća nullable `budget` (već ga vraća zbog `CASE`).

**Posljedica koju treba svjesno prihvatiti:** od sada `budget = 0` i `budget = NULL` znače različite stvari u cijelom sustavu. Sve što danas upisuje `0` kao "nema iznosa" mora upisivati `NULL` — vidi točku 3.

## 2. Mjesta gdje `null` može tiho postati 0 ili srušiti prikaz

Nabrojano iz stvarnog grepa, po ozbiljnosti.

**A. Pad (crash)**
- `ProjectMilestonesTab.tsx:115` — `milestone.budget.toString()`.

**B. Tiho pretvaranje u 0 pri PISANJU (najgore — kvari podatak)**
- `useProjectMilestones.ts:191` (`ProjectMilestonesTab` submit) — `parseLocaleAmount(budget).value || 0`
- `useProjectMilestones.ts:149`, `180`, `245`, `489` — `Number(...) || 0` na povratnim/VTR putanjama
- `useProjectMilestones.ts:349`, `363` — revizije budžeta

Ove se u koraku B mijenjaju samo tamo gdje je riječ o **korisnikovu unosu** (prazno polje → `null`). Putanje revizija i VTR-a rade nad fazama koje po definiciji imaju iznos; njih se ne dira, ali se dodaje zaštita: ako je iznos `null`, revizija/VTR se ne pokreće (umjesto da računa s 0).

**C. Prikaz — `null > 0` je `false`, pa se redak sam sakrije (ponašanje koje ŽELIMO)**
- `ProjectMilestonesTab.tsx:340,343,344,435`, `MilestoneKanban.tsx:81,82,147,189`, `ProjectTimelineTab.tsx:305`, `ProjectTransactionAddDialog.tsx:174`, `ProjectReportsDialog.tsx:196,378,599`, `projectStatusLine.ts:108`, `projectReportExport.ts:207`
- Ovdje nema promjene ponašanja; samo se u listi faza (točka 7) mijenja sadržaj retka.

**D. Aritmetika gdje `null` postaje 0 bez guarda (mora se eksplicitno rukovati)**
- `ProjectMilestonesTab.tsx:393` i `MilestoneKanban.tsx:187` — `m.budget + (m.spent || 0)` za contingency: `null + 5` = `5`, lažni podatak → dodati `null` guard (ne prikazuj contingency brojke).
- `ProjectFundingTab.tsx:54` — `sum + (m.budget || 0)` zbraja skriveno/prazno kao 0. Prelazi na `sumVisibleAmounts` iz `src/lib/milestoneAmounts.ts`; ako je rezultat `null`, prikaz je „—", ne 0.
- `ProjectFundingTab.tsx:123`, `projectReportExport.ts:228,393,573`, `ProjectReportsDialog.tsx:156,201,627`, `FinancialAssistantDialog.tsx:170` — formatiraju iznos izravno; `formatAmount(null)` daje 0,00 €. Prikaz „—" umjesto iznosa.
- `ProjectMilestonesTab.tsx:98` — `previousBudget = editingMilestone.budget` pa `Math.abs(new - previous)`: `null` → 0, pa upis prve vrijednosti izgleda kao „promjena budžeta" i traži razlog revizije. Guard: ako je prethodni `null`, to je **prvi upis**, ne revizija.
- `ProjectMilestonesTab.tsx:259` (VTR delete warning), `627` (usagePct), `ProjectRevisionsReport.tsx:102`, `MilestoneBudgetChangeSection.tsx:84,89,154,233,259` — svi rade s contingency/revizijama; dodaje se `null` guard bez promjene formule.

**Izvješća (PDF/CSV) se po zahtjevu NE diraju** — samo se `formatAmount(null)` zamijeni s „—" da izvješće ne tvrdi „0,00 €" tamo gdje iznosa nema. To nije promjena izračuna.

## 3. Forma faze

Datoteka: `src/components/projects/ProjectMilestonesTab.tsx` (dijalog, 819 linija — pri diranju izdvojiti dijalog u zasebnu komponentu `MilestoneFormDialog.tsx` da ostane ispod ~300 linija, uz `MilestoneAmountsSection.tsx` za dva polja + živi redak).

- `budget` → labela „Planirani trošak" + pomoćni tekst (materijal, radnici, podizvođači).
- `investor_price` → labela „Cijena prema investitoru" + pomoćni tekst.
- Oba prazna po defaultu; prazno se sprema kao `null`, ne 0.
- Popunjavanje pri uređivanju: `milestone.budget == null ? '' : String(milestone.budget)` (rješava pad iz točke 2A).
- **Prikaz polja ovisi o podatku, ne o ulozi:** kod uređivanja, ako je vrijednost `null` a faza postoji, polje se **ne renderira uopće** (skriveno iz pogleda). Kod nove faze prikazuju se oba (unos je vlasnikov).
- Faza iz odluke (`source_decision_id != null`): polje cijene je `disabled` uz kratku napomenu i poveznicu na odluku. Logika badge-a već postoji u `src/lib/milestoneDecisionSource.ts` — koristi se ona, ne nova.

## 4. Živi izračun marže

Nova čista funkcija u `src/lib/milestoneAmounts.ts` (proširenje, ne nova datoteka):

```
computeMilestoneMargin(cost: number|null, price: number|null)
  -> null                       // bilo koji null, ili price <= 0
  -> { pct, isNegative }        // pct = (price - cost) / price * 100
```

Redak se renderira samo kad funkcija vrati objekt. `isNegative` (cost >= price) → destructive boja + kratka napomena. Nikad „0%", nikad crtica.

## 5. Tip projekta (točka 6)

Najčišće prema postojećem modelu: dodati **`hasInvestor?: boolean`** na `ProjectTypePreset` u `src/lib/projectTypes.ts` i pomoćnik `projectTypeHasInvestor(project)`. Bez `hasInvestor` polje cijene se ne prikazuje, a labela troška ostaje „Planirani trošak".

Prijedlog vrijednosti (`true` = postoji vanjski naručitelj kojem se faza fakturira):

| `hasInvestor: true` | `hasInvestor: false` |
|---|---|
| construction_new, renovation, interior, it_software, marketing, retail_opening, manufacturing, hospitality_event | general, education, beauty, healthcare, private_event |

`general` je namjerno `false` — to je i osobni mod i sve zatečene projekte (svi su danas `general`), pa se u osobnom kontekstu forma ne mijenja vizualno. **Ovo je jedina odluka u planu koja je prosudba, ne nalaz — potvrdi ili ispravi popis.**

Iznimka: ako faza već IMA `investor_price` (npr. iz odluke) na projektu bez investitora, polje se svejedno prikazuje (read-only) — podatak se ne smije sakriti sam od sebe.

## 6. Lista faza (točka 7)

`ProjectMilestonesTab.tsx:435-443` i `MilestoneKanban.tsx:147-150`: umjesto `{milestone.budget > 0 && ...}` s jednim iznosom → jedan pomoćnik koji vraća retke:
- oba: `Trošak X · Investitoru Y`
- samo trošak: `Trošak X`
- samo cijena: `Investitoru Y`
- nijedan (oba `null`): **retka nema**

Postojeći progress bar potrošnje ostaje vezan isključivo uz trošak i prikazuje se samo kad je trošak broj > 0.

## 7. i18n

Novi ključevi pod `projects.milestoneAmounts.*` (`costLabel`, `costHelp`, `priceLabel`, `priceHelp`, `marginLine`, `negativeHint`, `fromDecisionLocked`, `hidden`) u `src/i18n/locales/{hr,en,de}.json`. Postojeći test `src/i18n/__tests__/untranslatedLocales.test.ts` hvata nedostajuće prijevode.

## 8. Testovi

Vitest, čista logika (`src/test/milestoneMargin.test.ts`):
- `computeMilestoneMargin(null, 100) === null`, `(100, null) === null`, `(null, null) === null`
- `(100, 0) === null` i `(100, -5) === null` — nema dijeljenja s nulom
- `(0, 100)` → 100% (nula je legitiman trošak, nije „prazno")
- `(100, 100)` i `(120, 100)` → `isNegative: true`
- `(8000, 10500)` → 24% (zaokruživanje kao u zahtjevu)
- `sumVisibleAmounts` preskače `null`, ne zbraja ga kao 0

Render (`@testing-library/react`, prema postojećem `src/test/milestoneVisibility.test.ts`):
- faza s `budget: null` → u DOM-u nema ni labele „Planirani trošak" ni praznog inputa (`queryByLabelText` = `null`), ne samo prazna vrijednost
- faza s `investor_price: null` → isto za cijenu
- faza sa samo jednim iznosom → nema retka marže u DOM-u
- projekt bez investitora → polje cijene se ne renderira
- faza iz odluke → polje cijene prisutno i `disabled`

## 9. Rizici

- **Osobni mod.** Svi zatečeni projekti su `project_type = 'general'`, koji je predložen kao `hasInvestor: false` → forma u osobnom modu vizualno nepromijenjena osim nove labele i pomoćnog teksta. Ako se `general` prebaci na `true`, svaki osobni projekt dobiva polje „Cijena prema investitoru" — to bi bila regresija u osobnom kontekstu.
- **VTR.** VTR faza pri stvaranju dodaje svoj `budget` na `contract_value` projekta (`useProjectMilestones.ts:180-232`). Ako VTR ostane bez iznosa (`null`), aneks bi se stvorio na 0. Rješenje: za VTR trošak ostaje **obavezan** (validacija u formi), ostatak faza je neobavezan. Bez toga se dira ugovorena vrijednost, što je izričito zabranjeno.
- **Faze iz odluka.** `investor_price` je snimka odluke; zaključavanje polja sprječava razmimoilaženje, ali korisnik može i dalje mijenjati trošak — to je namjerno i ne dira aneks.
- **Revizije budžeta.** Prvi upis iznosa u fazu koja je bila prazna ne smije aktivirati `MilestoneBudgetChangeSection` (traženje razloga i tipa revizije), inače se novi tok blokira. Guard je opisan u točki 2D.
- **Skriveno vs. prazno.** UI ne razlikuje „nemaš pravo vidjeti" od „nije upisano" — u oba slučaja polje se ne renderira. To je namjerno i u skladu sa zahtjevom („ne smije ni naslutiti da polje postoji"), ali znači da vlasnik ne vidi razliku ni za sebe; za vlasnika se polje uvijek renderira (vlasnik nikad ne dobiva `null` iz zaštite), pa je razlika bezopasna.
- **Zbrojevi na razini projekta** ostaju nepromijenjeni; jedina promjena je da `ProjectFundingTab` više ne broji skriveno kao 0. Ako se to smatra promjenom izračuna, reci i ostavljam ga netaknutim.

## Što se izričito NE dira

Ugovorena vrijednost projekta, saldo, marža i zarada na dashboardu, sadržaj i formule PDF izvješća, prava pisanja po ulogama (korak D), postojeći podaci i njihova migracija.
