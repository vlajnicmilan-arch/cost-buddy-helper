
## Problem (sažeto)

Polje `custom_payment_sources.balance` se ažurira **inkrementalno** kod svakog unosa, neovisno o datumu transakcije. Zato korekcija salda (snapshot stvarnog stanja) puca čim korisnik kasnije unese stari račun s datumom prije korekcije — taj račun se "duplo plati": jednom kroz korekciju (koja je odražavala stvarno stanje banke, dakle već uključivala taj račun), drugi put kroz sam unos.

## Konceptualno rješenje koje predlažem

**Korekcija postaje "sidro" (anchor).** Pravilo:

> Saldo izvora = `iznos zadnje korekcije` + zbroj svih transakcija s datumom **strogo nakon** datuma te korekcije.

Sve transakcije s datumom **≤ datum zadnje korekcije** se i dalje pojavljuju u povijesti (revizijski trag, izvještaji, kategorije), ali **NE mijenjaju saldo** izvora. Logika: korekcija je već "pojela" cijelu povijest do svog datuma.

Ovo je najmanje invazivna i konceptualno najčistija opcija — odgovara mentalnom modelu koji svaki korisnik ima ("postavio sam saldo na 21,21 €, to je istina od tog trenutka").

## Zašto ne neke druge opcije

- **"Samo upozorenje pri unosu"** — ne rješava postojeće duple unose, oslanja se na to da korisnik svaki put ispravno odluči. Krpa, ne fix.
- **"Brojanje od nule"** (suma svih transakcija bez `balance` polja) — zahtijeva potpuni rewrite svih balance kalkulacija, breaking change za bank sync, dashboard, izvještaje, projekte, krug.
- **"Razdvojeni unos: 'utjecaj na saldo' da/ne"** — komplicira UX, korisnik mora razmišljati o internom modelu aplikacije.

## Što se mijenja (tehnički)

**Schema (1 migracija):**
- Dodaj `correction_anchor_date timestamptz` i `correction_anchor_balance numeric` na `custom_payment_sources`. Setiraju se pri svakoj korekciji.
- Backfill iz postojećih `expenses` redaka s `expense_nature='correction'` (zadnja korekcija po izvoru).

**Balance recompute (jedna funkcija, jedan izvor istine):**
- `recomputeSourceBalance(sourceId)` = `correction_anchor_balance + SUM(signed_amount za expenses gdje payment_source = sourceId I date > correction_anchor_date I expense_nature != 'correction')`.
- Poziva se: nakon korekcije, nakon insert/edit/delete transakcije, nakon importa, nakon spajanja bank-merge parova.

**`useBalanceUpdater` mijenja se:**
- Više ne radi inkrementalni ±amount na balance polje.
- Umjesto toga poziva `recomputeSourceBalance` za pogođeni izvor.
- Razlog: inkrementalni model je upravo izvor buga; recompute je deterministički i otporan na out-of-order unose.

**Korekcija (`CustomPaymentSourcesPanel.handleBalanceCorrection`):**
- Postavlja `correction_anchor_date = now()`, `correction_anchor_balance = newBalance`.
- I dalje upisuje `expense_nature='correction'` redak u povijesti (revizijski trag — vidljiv u listi, ali isključen iz recompute sume).
- `difference` se više ne računa kao expense/income iznos koji utječe na saldo — korekcija je sama po sebi anchor.

**UI (mali nudge, ne mijenja workflow):**
- U detalju transakcije čiji je `date ≤ correction_anchor_date` izvora, prikaži diskretan badge: *"Ne utječe na trenutni saldo (prije korekcije od 20.06.)"*.
- Tooltip na korekciji u listi: *"Saldo je 'resetiran' na ovaj datum. Sve starije transakcije su informativne."*

**Backfill tvog konkretnog slučaja:**
- Migracija će za `Tekući zaštićeni` postaviti anchor na 20.06. 07:08, balance 21,21 €.
- Recompute će dati: 21,21 + 0 (jer su 12,78 i 13,49 datumi 19.06. i 09.06., oba prije anchora) = **21,21 €**.
- Saldo se vraća na ono što si htio, transakcije ostaju u povijesti.

## Rubni slučajevi (rješavaju se u istoj iteraciji)

1. **Edit datuma postojeće transakcije** preko/ispod anchora → recompute pokriva oba slučaja.
2. **Brisanje korekcije** → anchor pada na prethodnu korekciju ili na NULL (= zbrajaj sve, klasično ponašanje).
3. **Više korekcija** → uvijek vrijedi **zadnja** (po datumu kreiranja). Ranije postaju samo povijest.
4. **Transfer između izvora** → standardno, recompute na oba izvora.
5. **Bank sync uvozi staru transakciju (datum prije anchora)** → ne mijenja saldo, prikaže badge. Korisnik može svjesno napraviti novu korekciju ako želi.

## Što NE diram

- Dashboard agregacije, izvještaji, kategorije, projekti — i dalje vide sve transakcije; samo se mijenja izračun `balance` polja izvora.
- `expenses` shema, RLS, tipovi.
- Personal/Business mode izolacija.

## Plan isporuke

1. **Migracija**: dva nova polja na `custom_payment_sources` + backfill iz postojećih `correction` expense redaka.
2. **SQL funkcija** `recompute_custom_source_balance(uuid)` (security definer, callable iz klijenta i triggera).
3. **Trigger** na `expenses` (AFTER INSERT/UPDATE/DELETE) koji pozove recompute za pogođeni `payment_source`. Time `useBalanceUpdater` postaje suvišan za custom izvore — uklonim njegove pozive za `custom:UUID` slučajeve, ostavim za eventualne legacy putanje.
4. **Refaktor `handleBalanceCorrection`**: setira anchor, ne računa difference, i dalje upisuje audit redak.
5. **UI**: badge na pre-anchor transakcijama u detail dialogu i u listi (mala oznaka pored datuma). i18n hr/en/de.
6. **Testovi**: vitest za pure helper `computeBalanceFromAnchor(anchor, expenses)` s rubnim slučajevima (točan datum anchora, transfer, brisanje korekcije, više korekcija).
7. **Smoke**: ručno provjeriti tvoj `Tekući zaštićeni` nakon migracije — očekivani saldo 21,21 €.

## Što ti trebam potvrditi prije nego krenem

- Slažeš li se s pravilom "**transakcija s datumom = datumu korekcije** se računa u staro (ne mijenja saldo)"? Alternativa je "= datum korekcije se računa u novo". Predlažem **strogo veće od** (`>`), jer je korekcija logički zadnji događaj tog datuma.
- OK ti je da se anchor radi na razini **izvora plaćanja** (svaki račun/wallet zasebno)? To je već implicirano postojećim modelom korekcije.
