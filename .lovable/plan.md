
# Usklađivanje politike naplate s aplikacijom

Cilj: sve što piše u marketingu (Landing, Paywall, FAQ) i u `subscriptionTiers` mora odgovarati onome što kod stvarno radi. **Skeniranje računa s PDV-om se NE implementira** — samo se uklanjaju lažne tvrdnje.

## 1. Ukloniti tvrdnju o R-1 / PDV skeniranju (FAQ)

`src/i18n/locales/hr.json` (i isti ključevi u `en.json`, `de.json`):

- `faq.questions.businessReceiptVat` → preformulirati pitanje u "Mogu li skenirati račune u poslovnom načinu?"
- `faq.answers.businessReceiptVat` → ukloniti rečenicu "AI prepoznaje neto iznos, PDV i ukupno" i zamijeniti s istinitom: AI prepoznaje ukupan iznos, izdavatelja, datum i stavke; **PDV se ne razdvaja automatski** — ako trebaš razlomak po stopama, unesi ručno na transakciji.

## 2. Limit od 5 skeniranja računa mjesečno

Trenutno se nigdje ne provodi (`useReceiptScanner.ts` i `parse-receipt` edge funkcija nemaju brojač). Dvije opcije — **biram opciju B (uklanjanje tvrdnje)** jer je manje rizično i u skladu s tvojim pravilom "ne lijepi guard/quick fixe":

- Provjeriti gdje se u marketingu (Landing / Paywall / `landingTranslations.ts` / `i18n` `subscription.*`) spominje "5 skeniranja" i ukloniti / zamijeniti s "AI skeniranje računa" bez broja.
- Ostaviti zaista provedene Free limite (broj transakcija, projekata, budžeta, izvora plaćanja) kako jesu.

## 3. Paywall — i18n refaktor

`src/pages/Paywall.tsx` ima hardkodirane hrvatske stringove za feature liste. Zamijeniti s `t()` ključevima pod `paywall.features.*` u sve tri locale datoteke. Format prikaza i logika ostaju isti — samo zamjena stringova.

## 4. Landing — ažuriranje feature liste

`src/pages/landingTranslations.ts` i `src/pages/LandingBelowFold.tsx` ne spominju recentno isporučene module. Dodati u feature mrežu (HR/EN/DE):
- Recurring transactions (auto-prepoznavanje uplata/troškova)
- Cashflow forecast (8 tjedana)
- Multi-currency (više valuta po izvoru, ECB tečajevi)
- Push notifikacije (FCM v1)
- Završetak projekta + status linije na karticama (recentno)

Tier opisi u istoj datoteci dobivaju jednu rečenicu o više profila tvrtki za Business.

## 5. Konzistentnost `subscriptionTiers.ts`

Nema promjena cijena (već se podudaraju sa Stripe live). Samo proširiti `features` arrays Pro/Business stringovima koje ćemo prevoditi (gore navedeni moduli) tako da `Paywall` i Landing crpe iz istog izvora gdje god je moguće.

## Što NE radim

- Ne uvodim PDV ekstrakciju u `parse-receipt` (potvrđeno).
- Ne uvodim brojač skeniranja računa (uklanjam tvrdnju umjesto toga).
- Ne mijenjam cijene ni Stripe konfiguraciju.
- Ne diram RLS, edge funkcije osim ako se to tiče gornjih tvrdnji (ne tiče se).

## Tehnički sažetak izmjena

| File | Change |
|---|---|
| `src/i18n/locales/{hr,en,de}.json` | FAQ R-1 tekst, novi `paywall.features.*` ključevi, eventualno `landing.*` proširenja |
| `src/pages/Paywall.tsx` | hardkodirani stringovi → `t()` |
| `src/pages/landingTranslations.ts` | dodati nove feature retke + Business opis |
| `src/pages/LandingBelowFold.tsx` | render novih featurea ako nije već dinamičan |
| `src/lib/subscriptionTiers.ts` | proširene `features` liste (bez promjene tier ID/cijena) |

Procjena: ~6 datoteka, bez DB migracija, bez Stripe izmjena.
