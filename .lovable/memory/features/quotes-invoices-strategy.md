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

## Faza 3 — Cashflow & naplata (TODO)
- Aging report (overdue invoices widget)
- "Neplaćeno" dashboard widget
- Auto-email podsjetnici klijentima
- P&L per project (već postoji `ProjectProfitLossCard`, treba integrirati invoice income)

## Granice (anti-scope-creep, dogovoreno s userom)
- NEMA fiskalizacije/JIR/ZKI
- NEMA eRačuna (B2B/B2G)
- NEMA kontnog plana ni temeljnica
- NEMA PDV obrazaca (PDV-S, ZP, JOPPD)
- Svaki generirani PDF ima disclaimer "Nije fiskalizirani porezni račun"
