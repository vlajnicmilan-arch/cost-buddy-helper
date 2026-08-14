---
name: Podsjetnici za dospijeće ulaznih računa
description: Cron 08:30 UTC, faze d3+d0, dedup invoice_due:{id}:{stage}, agregat prekoračenih u "Za pažnju", globalni prekidač invoice_due_enabled
type: feature
---

Ulazni računi (`incoming_invoices`, `direction='in'`, `paid_at IS NULL`) sami zvone — NULA korisnikovih dodira za postavljanje (dospijeće je već pročitano iz dokumenta).

- Faze: **točno dvije** po računu — `d3` (3 dana prije) i `d0` (na dan). Ništa drugo.
- **Povijest ne zvoni**: prošlo dospijeće NIKAD ne okida podsjetnik (retroaktivni val je zabranjen).
- Dedup: `invoice_due:{invoice_id}:{stage}` — cron je idempotentan.
- Samogašenje: okidač `incoming_invoice_resolve_due_notifications` (`incoming_invoices` update/delete + `eracun_payment_links` insert) gasi aktivne podsjetnike čim je račun plaćen/obrisan.
- Cron: `invoice-due-reminders-daily`, 08:30 UTC. Funkcija podržava `{"today":"...","dry_run":true}` za provjeru bez upisa.
- Prekoračeni računi = **STANJE, ne događaj**: nema dnevnog zvocanja; jedna agregatna stavka u „Za pažnju“ (`detectOverdueIncomingInvoices`, dedup `overdue_incoming_invoices`) koja se sama povuče kad prekoračenih više nema.
- Gašenje: jedan globalni prekidač `notification_preferences.invoice_due_enabled` (default true) → Postavke ▸ Obavijesti. Isključen = ni push ni in-app.
- Čista logika: `supabase/functions/_shared/invoiceDue.ts`, testovi `src/test/invoiceDueReminders.test.ts`.
