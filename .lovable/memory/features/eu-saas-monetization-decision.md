---
name: EU SaaS Monetization Decision
description: Otvoreno pitanje izbora payment providera za produkciju (Paddle MoR vs Stripe direkt) - čeka konzultaciju s računovođom
type: feature
---

**Status: ODLUKA NA ČEKANJU** (korisnik konzultira računovođu/poreznog savjetnika)

## Kontekst
- Pravna forma: j.d.o.o. (HR)
- Model: SaaS pretplata B2C + B2B
- Tržište: cijela EU
- Trenutno u kodu: Stripe direktno (`create-checkout`, `customer-portal`, `check-subscription`, `stripe_subscriptions` tablica) — bring-your-own-key, ne Lovable seamless

## Glavno pitanje
Zadržati Stripe direkt (sami radimo OSS/VAT) ili preći na Paddle MoR (Paddle = pravni prodavač, sve compliance riješeno)?

## Kratka analiza
- **Paddle MoR** (5% + €0.50): Paddle obračunava VAT po državi kupca, prijavljuje, plaća. j.d.o.o. ima samo 1 kupca (Paddle), 1 mjesečnu B2B uplatu, 1 račun. Nula EU admin obaveza.
- **Stripe + full compliance** (+3.5% na bazu): Stripe MoR u 36 zemalja, ostalo sam.
- **Stripe + Tax** (+0.5%): Stripe samo računa porez, ti registriraš OSS i prijavljuješ.
- **Stripe sam**: najjeftinije po txn, ali sav admin teret na j.d.o.o.

Preporuka iz razgovora: **Paddle** je najjednostavnije za j.d.o.o. bez stalnog poreznog savjetnika za EU; razlika u trošku vs Stripe-sam (~€0.40/txn) niža je od cijene računovođe za EU VAT (~€100-200/mj) do nekoliko stotina pretplatnika.

## Što je riješeno strateški
- HR fiskalizacija (KassenSichV-tip zakoni) NE primjenjuje se na cross-border digital SaaS plaćen karticom preko stranog procesora — provjeriti s računovođom za potvrdu.
- B2C cross-border digital usluge u EU: VAT po stopi kupčeve države (place-of-supply pravilo iz 2015.).
- B2B s VIES VAT ID: reverse charge.

## Pitanja za računovođu (prema korisniku)
1. PDV registracija od dana 1 za cross-border digital?
2. OSS: kada i kako?
3. Knjiženje Paddle isplata (B2B reverse charge iz UK/IE)?
4. Trošak vođenja OSS prijava ako ide Stripe direkt?
5. HR fiskalizacija za digitalne usluge plaćene karticom?

## Sljedeći korak
Kad se korisnik vrati s odlukom računovođe — ako Paddle, pripremiti migration plan sa Stripe-a (3 edge funkcije, webhook, subscription_tiers mapping). Ako Stripe ostaje, dodati Stripe Tax modul.
