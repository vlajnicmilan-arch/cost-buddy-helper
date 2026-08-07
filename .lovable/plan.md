# Nalaz: pet Aircash nadoplata upisano kao odljev

Dijagnostika, bez izmjena. Sve tvrdnje potvrđene čitanjem koda i redaka u bazi.

## 1. Kako motor salda tretira `type='transfer'`

Smjer je tvrdo kodiran na dva mjesta, oba istovjetna:

- `public._expenses_recompute_source_balance()` (trigger, delta-put kad izvor nema sidro)
- `public.recompute_custom_source_balance()` (sidreni put — ovaj se koristi za Aircash jer sidro postoji)

Oba imaju isti CASE:

```
transfer AND _extract_custom_source_id(payment_source) = izvor  -> -amount
transfer AND income_source_id = izvor                            -> +amount
```

Dakle: `payment_source` je **uvijek strana koja plaća**, `income_source_id` **uvijek strana koja prima**. Nema polja koje bi to okrenulo. Klijent (`useBalanceUpdater`) u cloud načinu ne računa ništa — samo refetcha; jedini autoritet je SQL.

## 2. Postoji li pojam smjera

Postoji, ali implicitno — smjer je *pozicija* izvora u paru, a ne zaseban podatak. Nema `direction` stupca, nema predznaka iznosa (`amount` je uvijek pozitivan), nema parnog retka. Jedan redak = oba kraja prijenosa.

Za tih pet redaka u bazi stoji:

| datum | iznos | payment_source | income_source_id |
|---|---|---|---|
| 26.7. | 75,19 | Aircash | Revolut |
| 27.7. | 50,00 | Aircash | Revolut |
| 28.7. | 50,00 | Aircash | Revolut |
| 29.7. | 50,00 | Aircash | Revolut |
| 30.7. | 58,20 | Aircash | Revolut |

Zapisano je „Aircash plaća Revolutu". Stvarnost je obrnuta. Polje nije prazno — **popunjeno je naopako**.

Isti obrazac ima i redak od 23.7. (100,00, Aircash → Revolut) i „Uplata gotovine na Aircash Ina" 200,00 (Aircash → Keš). Oni su na dan sidra pa ne ulaze u sumu, ali su jednako krivo okrenuti.

## 3. Gdje je odlučeno da su transfer i da su odlazni

Dvije odvojene odluke, obje u putu uvoza izvoda:

**Da je transfer** — `src/lib/csvParsers.ts` → `isInternalTransfer()`, ključna riječ doslovno `'uplata na aircash'`. Safety net `src/lib/pdfPostProcess.ts` isto to potvrđuje nakon AI parsera. Ta funkcija vraća `boolean` — **prepoznaje da je prijenos, ali ne i u kojem smjeru**.

**Da je odlazan** — `src/lib/importReview/executor.ts`, transfer grana:

```
payment_source: tx.paymentSource,               // novčanik čiji je izvod
income_source_id: decision.targetIncomeSourceId // ono što je korisnik odabrao
```

Uvoženi izvod bio je **Aircashov** (u istoj seriji `3853caad…` su i „POS plaćanje LOVABLE", „Aircash Pay Jadrolinija"). Executor bezuvjetno stavlja novčanik izvoda na stranu koja plaća. Za retke koji na tom izvodu predstavljaju **priljev** to je uvijek pogrešno, i to bez ijedne provjere.

UI to ne može spasiti: `ImportReview.tsx` nudi samo `importReview.transferTo` — „Prijenos na". Ne postoji „Prijenos s". Korisnik je odabrao Revolut kao drugu stranu; jedino značenje koje je aplikacija znala pridati tom odabiru bilo je „Aircash → Revolut".

## 4. Je li krivo naučeno pravilo („Zapamti")

Ne. `import_transfer_rules` je **prazna tablica** (0 redaka, provjereno). Nijedno pravilo nije naučeno ni primijenjeno. Uz to, `matchTransferRule` je i sam bez smjera — ključ je `(user_id, merchant_key, source_wallet_key)`, a rezultat samo `target_income_source_id`, pa bi naučeno pravilo reproduciralo isti krivi smjer. Kvar je u modelu, ne u pravilu.

## 5. Zajednički korijen — odgovor je: ne postoji

Tri puta, tri neovisne odluke o smjeru novca:

| Put | Čime određuje smjer | Kvar |
|---|---|---|
| Bankovna sinkronizacija | `credit_debit_indicator === "CRDT"` | jutrošnji: pending redci vraćeni kao CRDT → kupnja upisana kao priljev |
| Uvoz izvoda (CSV/PDF) | pozicija u executoru: izvod = uvijek platitelj | ovaj: nadoplata upisana kao odljev |
| Ručni unos | korisnik bira tip u obrascu | — |

Nema zajedničkog modula. Nema tipa koji bi nosio smjer kroz cijeli lanac. `isInternalTransfer()` je booleanska funkcija koja po dizajnu ne može odgovoriti na pitanje smjera, a jedina strana koja to zna — opis retka („**Uplata na** Aircash" vs. „Aircash Pay …") — nigdje se ne čita u tu svrhu.

To je strukturni problem, veći od oba pojedinačna kvara. Svaki novi put uvoza nasljeđuje istu prazninu.

## 6. Prijedlog popravka postojećih pet redaka

Tri opcije, po rastućem riziku:

**A. Zamijeniti strane (preporučeno).** Za tih pet redaka `payment_source` ↔ `income_source_id`: `payment_source = 'custom:4934f97e…'` (Revolut), `income_source_id = '0716b12f…'` (Aircash). Semantički točno, jedan redak i dalje nosi cijeli prijenos, trigger sam prerarčuna oba salda. Ali **mijenja i Revolutov saldo** za −283,39 — ako je Revolut trenutno točan, to ga kvari, što znači da je Revolut već negdje drugdje pokrio te odljeve. To treba provjeriti prije zahvata.

**B. Promijeniti tip u `income` na Aircashu.** `type='income'`, `income_source_id=NULL`. Aircash odmah točan (+283,39), Revolut netaknut. Gubi se veza para — prijenos postaje „prihod niotkuda". Ispravno ako je Revolutova strana već zabilježena kao zaseban rashod.

**C. Soft delete + ručni ponovni unos.** Najčišći trag, najviše posla.

Odluka između A i B ovisi isključivo o jednome: **je li Revolutova strana tih pet nadoplata već negdje zabilježena.** Rekao si da par ne postoji nigdje — ako to vrijedi i za Revolut, ispravno je **A**. Ako je Revolut točan bez tih redaka, ispravno je **B**.

Prije bilo čega treba provjeriti Revolutov saldo naspram stvarnog. Tu provjeru nisam radio.

## 7. Što bi trebalo popraviti u kodu (ne sada)

1. `isInternalTransfer()` → vratiti smjer, ne boolean (`'in' | 'out' | null`). Opis to nosi: „Uplata **na** X" = ulazni, „Uplata **s**/podizanje" = izlazni.
2. Executor: prestati pretpostavljati da je izvod uvijek platitelj — posložiti par prema smjeru iz točke 1.
3. `ImportReview`: ponuditi „Prijenos **s**" uz „Prijenos **na**", s prijedlogom iz opisa.
4. `import_transfer_rules`: dodati smjer u pravilo, inače naučeno pravilo cementira grešku.
5. Jedan zajednički modul smjera koji koriste i sinkronizacija i uvoz — inače će treći put uvesti četvrtu varijantu istog kvara.

Ništa od ovoga nije napravljeno. Čekam odluku o opsegu.
