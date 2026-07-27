
# Dijagnoza — "Tekući zaštićeni" (HR6624020063581325267)

**READ-ONLY. Ništa nije mijenjano.**

## 1) Identifikacija sourca

| polje | vrijednost |
|---|---|
| source_id | `99f9425d-f37c-44ea-81b9-3d10e311b44d` |
| name | Tekući zaštićeni |
| currency | EUR |
| **balance (prikaz)** | **-77,48** |
| **correction_anchor_balance** | **7,30** |
| correction_anchor_date | 2026-07-07 05:32:29 UTC |
| anchor_source | `user_confirmed` |
| bank_accounts.balance | **57,34** |
| bank last_synced_at | 2026-07-27 19:43 UTC |

## 2) anchor_audit — samo JEDAN zapis

```
2026-07-22 18:01:01  |  → 7,30  @ 2026-07-07 05:32:29  |  user_confirmed
actor: Milan
reason: "Faza 1 backfill: postojeće korisničko sidro dokumentirano u auditu"
```

Sidro je došlo iz **Faze 1 backfill migracije** koja je dokumentirala tada zatečeno stanje (7,30) kao `user_confirmed`. Nakon toga sidro nikad nije dirano. **Bankin realni saldo 57,34 nikad nije postavljen kao sidro** — isti obrazac kao Tekući −3,00, samo obrnut smjer.

## 3) Post-anchor transakcije (event_at > 2026-07-07 05:32:29)

12 redova ukupno:
- expense: 10 kom, suma **808,37**
- income: 2 kom, suma **655,99**
- net delta: **−152,38**

Očekivano po formuli `balance = anchor + net_delta`:
`7,30 + (−152,38) = −145,08`

Stvarno prikazano: **−77,48**

**Drift: +67,60** koji formula ne objašnjava. Mogući uzroci (nisam verificirao — treba recompute preview koji ne postoji kao funkcija u ovoj bazi):
- transferi (7 redova u ukupnoj povijesti, potencijalno neki nakon sidra kroz drugi payment_source label),
- reverse/refund/correction expense_nature,
- day-cut/hybrid pravilo koje odsijeca dio post-anchor transakcija (jedan expense je datiran **2028-06-26** — očito ručno unesen s krivim datumom, izvan realnog raspona; može utjecati na cutoff logiku),
- razlika između `event_at` i cutoff kolone koju engine koristi.

**Ovo NIJE čisti "krivo sidro" slučaj** — ima drift koji zahtijeva dodatnu analizu prije nego se sidro pomakne.

## 4) Ključni nalaz

- Sidro **jest** postavljeno na krivu (prestaru) vrijednost 7,30 iz backfilla — to je primarna netočnost.
- Ali samo pomicanje sidra na 57,34 **neće nužno dati saldo koji Milan očekuje**, jer trenutni prikaz (−77,48) već ne slijedi čistu formulu anchor+delta. Postoji dodatni faktor (~67,60) koji engine primjenjuje.
- Prije popravka treba razumjeti taj drift, inače popravak može dati novu netočnu brojku.

## 5) Predloženi popravak — SAMO OPIS, ne izvršavam

Ako Milan potvrdi da 57,34 **jest** stvarno stanje **na današnji datum** (a ne na neki povijesni presjek), popravak bi bio isti obrazac kao −3,00 slučaj:

```sql
SELECT public.set_source_anchor(
  p_source_id   => '99f9425d-f37c-44ea-81b9-3d10e311b44d'::uuid,
  p_new_balance => 57.34,
  p_as_of       => now(),
  p_reason      => 'Manual fix: sidro poravnato s bankinim realnim saldom (backfill 7,30 bio zastario)'
);
```

Efekt: novi `user_confirmed` audit red, balance i sidro postavljeni na 57,34, sve post-anchor transakcije s `event_at <= now()` biti će odsječene (jer je novo sidro "istina od sada"), buduće transakcije računat će se od 57,34.

**Ali:** ako Milan želi da povijest ostane vidljiva i da saldo bude 57,34 **s uvažavanjem** budućih promjena, ovo je ispravan potez. Ako želi rekonstrukciju "što je pošlo krivo" — treba prvo istražiti drift od 67,60 (transfer/refund/2028-datum artefakt).

## Preporuka

Prije nego se pozove `set_source_anchor`, tražim od Milana odgovor na dva pitanja:
1. Je li 57,34 **trenutno stanje danas** (bankin live saldo)? Ako da, pomicanje sidra na now() je ispravno.
2. Želi li da istražim drift od 67,60 (zašto engine pokazuje −77,48 umjesto −145,08) prije popravka? Može indicirati širi bug u recomputeu — ili banalan uzrok (transfer/2028-datum) koji ne zahtijeva odgodu.

Ne izvršavam ništa dok Milan ne odluči.
