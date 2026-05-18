---
name: Quotes & Invoices Strategy
description: 3-faza pristup za ponude i račune kao interni tracker — bez fiskalizacije/eRačuna/PDV obrazaca
type: feature
---

App je **interni tracker** za ponude i račune. **NIKAD** fiskalizacija/eRačun/PDV obrasci/JIR/ZKI.

## Faza 1 — Ponude (IMPLEMENTIRANO)
- `project_estimates` tablica + `useProjectEstimates`
- `EstimateDialog` + `ProjectEstimatesPanel` (props: `projectId`, `compact`)
- `src/lib/estimatePdf.ts` — interni PDF s disclaimerom
- Year-based number `P-YYYY-NNN`
- Embedded u `ProjectFundingTab` ("Ponude za ovaj projekt")

## Faza 2 — Računi tracker (IMPLEMENTIRANO)
- `project_invoices` tablica (status: issued/partially_paid/paid/cancelled, +overdue izračunat iz `due_date`)
- `expenses.invoice_id` (nullable FK) — plaćanja kao income transakcije linkane na račun
- `useProjectInvoices` (s `payments` mapom i `getEffectiveStatus()`)
- `InvoiceDialog` + `ProjectInvoicesPanel` (props: `projectId`, `compact`)
- `src/lib/invoicePdf.ts` — "PREGLED RAČUNA" s disclaimerom + prikaz plaćeno/preostalo
- Year-based number `R-YYYY-NNN`
- Pre-fill iz ponude preko `prefillFromEstimateId` prop
- Embedded u `ProjectFundingTab` ("Računi za ovaj projekt")
- i18n namespace `invoices.*` u hr/en/de

## Faza 3 — Cashflow & naplata (IMPLEMENTIRANO)
- `useUnpaidInvoices` hook — outstanding total, overdue count + aging buckets (0-30/31-60/61-90/90+)
- `UnpaidInvoicesWidget` — dashboard widget (samo business chip view), klik otvara Sheet s `UnpaidInvoicesList`
- `SendInvoiceReminderDialog` — neformalni email podsjetnik klijentu (custom poruka + osnovni podaci računa + opcionalni PDF link 7 dana)
- Email template `invoice-payment-reminder` (registriran u `registry.ts`) — šalje se kroz `send-transactional-email`
- Reminder gumb dostupan iz `ProjectInvoicesPanel` (svaki unpaid invoice) i iz dashboard sheeta
- P&L per project: plaćanja kroz `expenses.invoice_id` automatski idu u project income (već radi kroz `ProjectProfitLossCard`)

## Faza 3+ — Automatizacija (IMPLEMENTIRANO)
- `project_invoices.client_email` + `auto_reminders_enabled` + `pdf_path` (snapshot za auto reminder)
- `invoice_reminders` tablica (UNIQUE invoice_id+stage+trigger) za dedup
- Storage bucket `invoice-pdfs` (privatni, RLS po user_id u path-u)
- `src/lib/invoicePdfUpload.ts` — `uploadInvoicePdfAndSign` (signed URL za manual reminder) + `uploadInvoicePdfSnapshot` (persistira pdf_path u redak za auto cron)
- Edge `auto-invoice-reminders` — cron svaki dan u 09:00 UTC, šalje stage 3/7/14 dana kašnjenja s potpisanim PDF linkom (7 dana) iz `pdf_path` ako postoji
- InvoiceDialog automatski upload-a PDF snapshot kad je `auto_reminders_enabled=true && client_email`


## Granice (anti-scope-creep, dogovoreno s userom)
- NEMA fiskalizacije/JIR/ZKI
- NEMA eRačuna (B2B/B2G)
- NEMA kontnog plana ni temeljnica
- NEMA PDV obrazaca (PDV-S, ZP, JOPPD)
- Svaki generirani PDF ima disclaimer "Nije fiskalizirani porezni račun"
