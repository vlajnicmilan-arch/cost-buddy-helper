---
name: Bank Sync Roadmap (post-sandbox)
description: Sljedeći koraci za bank sync nakon što se spoji prava banka (ne sandbox)
type: feature
---

Trenutno stanje: bank-link-account + bank-sync-transactions deployani i rade. AI kategorizacija radi ali sandbox (Aino Salo) ima samo numeričke reference pa sve pada u "other". Čeka se prava banka prije nastavka.

Sljedeći koraci (kad bude prava banka):

**Korak 3 — Auto-sync (cron):** pg_cron job koji periodički zove bank-sync-transactions za sve linkane račune. Bez ručnog klika "Sinkroniziraj".

**Korak 4 — Balance update:** nakon sync-a auto-update balansa custom_payment_source iz Enable Banking `/accounts/{id}/balances`. Pažnja: može konfliktirati s ručnim unosima — treba flag ili reconciliation logika.

**Korak 5 — Transfer detection:** ako 2 sinkronizirane transakcije čine transfer (isti iznos, isti/blizak datum, jedna -, jedna +, oba računa korisnikova), označiti kao `transfer` umjesto expense/income. Reuse `transferMatching.ts`.

**Korak 6 — Recurring matching:** match sinkronizirane transakcije s postojećim recurring patternima (Netflix, najam) preko `useRecurringMatcher`. Auto-link ili predloži korisniku.

Preporučeni redoslijed: 3 → 5 → 6 → 4 (balance zadnji jer je najrizičniji).
