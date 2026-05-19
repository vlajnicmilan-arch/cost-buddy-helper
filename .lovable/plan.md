# PDF uvoz — popravak i dijagnostika (19.5.2026)

Status: implementirano, čeka korisnikov test pokušaj.

Promjene u `src/components/PaymentSourceTransactionsDialog.tsx`:
1. `runPdfJob` guard: ako je isti `jobId` već aktivan (`activePdfJobIdRef`), drugi poziv se preskače i logira `payment_source_pdf_polling_skipped_duplicate`. Sprječava dvostruko polling za isti job.
2. Uklonjen `fetchLatestPDFParseJob` recovery iz dialoga (mogao je vratiti tuđi `processing` job). Recovery sada ide samo preko per-source localStorage ključa `vmb-pdf-parse-job:<sourceId>`.
3. `handlePdfJobResult`: novi redoslijed — `clearStoredPdfJob` → `setSourceParsedData` → `setPdfPreviewOpen(true)` → `setPdfJobPhase('completed')` → reset `activePdfJobIdRef`/`pdfJobId`. Processing overlay više ne ostaje iznad previewa.
4. Pri grešci u jobu: čisti storage key i job state odmah, ne ostavlja zaglavljeno `pdfJobId`.
5. Dodani dijagnostički eventi:
   - `payment_source_pdf_start_attempt`, `payment_source_pdf_start_ok`
   - `payment_source_pdf_polling_skipped_duplicate`
   - `payment_source_pdf_no_transactions`
   - `payment_source_pdf_import_blocked`, `payment_source_pdf_import_clicked`
   - `payment_source_pdf_import_dedup`
   - `payment_source_pdf_import_all_duplicates`
   - `payment_source_pdf_duplicate_dialog_opened`
   - `payment_source_pdf_import_success`, `payment_source_pdf_import_failed`
   - `payment_source_pdf_duplicate_confirm_blocked`, `payment_source_pdf_duplicate_confirm_clicked`
   - `payment_source_pdf_duplicate_import_success`, `payment_source_pdf_duplicate_import_failed`

Verifikacijski upit (Zagreb vrijeme):
```sql
select created_at at time zone 'Europe/Zagreb' as t, event, details
from public.app_diagnostics_logs
where created_at > now() - interval '1 hour'
  and event ilike 'payment_source_pdf%'
order by created_at asc;
```

Očekivani slijed za jedan PDF uvoz:
`pdf_button_click` (postojeći `payment_source_import_picker_open`) →
`payment_source_pdf_file_selected` →
`payment_source_pdf_start_attempt` →
`payment_source_pdf_start_ok` →
`payment_source_pdf_polling_started` (jednom) →
`payment_source_pdf_polling_status` (status: completed) →
`payment_source_pdf_parse_result` →
`payment_source_pdf_preview_opened` →
`payment_source_pdf_import_clicked` →
`payment_source_pdf_import_dedup` →
(`payment_source_pdf_duplicate_dialog_opened` → `payment_source_pdf_duplicate_confirm_clicked` → `payment_source_pdf_duplicate_import_success`)
ili
`payment_source_pdf_import_success`.
