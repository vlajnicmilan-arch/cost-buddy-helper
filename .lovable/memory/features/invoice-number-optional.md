---
name: Broj računa nije obavezan
description: incoming_invoices.invoice_number nullable; prikaz kroz invoiceLabel.ts; mail_item_confirm hvata greške baze
type: feature
---
- 5.9.2026.: `incoming_invoices.invoice_number` više NIJE NOT NULL. Aplikacijski računi i blagajnički isječci (Bolt, parking) prolaze uz kvačicu „Ovaj dokument nema broj" (`allow_missing_number`).
- Jedinstveni indeksi (`..._unique_personal/_business/_noib`) sadrže broj, ali BEZ `NULLS NOT DISTINCT` — dva dokumenta bez broja se ne sudaraju. Ako se ikad doda `NULLS NOT DISTINCT`, ovo pada.
- Prikaz IDE ISKLJUČIVO kroz `src/lib/eracun/invoiceLabel.ts` (`invoiceNumberLabel` → „—", `invoiceDescriptor` → broj → naziv → „—"). Nikad sirovi `inv.invoice_number` u JSX-u.
- `mail_item_confirm` ima `EXCEPTION WHEN OTHERS` oko upisa u `incoming_invoices`/`document_links`/`document_ingest_items`: `SQLSTATE`+`SQLERRM` u `app_diagnostics_logs` preko `mail_confirm_log_reject`, korisniku `{ok:false, reason:'baza', db_code}`. Sirova engleska poruka NE ide na ekran.
- Čuvar: `src/test/invoiceNumberOptional.test.ts`.
