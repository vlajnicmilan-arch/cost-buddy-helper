import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category, PaymentSource, TransactionType } from '@/types/expense';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { logDiagnostic } from '@/lib/diagnosticLogger';
import { parseAiQuotaError, emitCoreScanLimitReached } from '@/lib/aiQuotaError';
import { reclassifyInternalTransfers } from '@/lib/pdfPostProcess';

export interface ParsedPDFTransaction {
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
  merchant_name: string | null;
  payment_source?: PaymentSource;
  card_last4?: string | null;
  // Installment metadata (Diners-style "EMMEZETA (6/7)" etc.)
  is_installment?: boolean;
  installment_current?: number | null;
  installment_total?: number | null;
  installment_base_description?: string | null;
  // For credit-card statements: actual billing date, may differ from `date` (original purchase)
  due_date_override?: string | null;
  // True for summary rows like "Specifikacija troškova - Diners (8881) 788,10 EUR"
  is_statement_total?: boolean;
  // Running balance ("saldo nakon") for the row — null on pending/no-balance banks.
  balance_after?: number | null;
  // True if row is in a "Pending / Na čekanju / U obradi" section.
  is_pending?: boolean;
}

export interface PDFParseResult {
  transactions: ParsedPDFTransaction[];
  detected_bank: string | null;
  account_iban: string | null;
  holder_name: string | null;
  cards_detected: string[];
  statement_due_date?: string | null;
  summary: {
    total_income: number;
    total_expenses: number;
    transaction_count: number;
  } | null;
}

export type PDFParseJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface PDFParseJobRow {
  status: PDFParseJobStatus;
  result: any | null;
  error: string | null;
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
const POLL_REQUEST_TIMEOUT_MS = 12_000;
// 100 polls: first 10 × 1 s, then 90 × 2 s = 190 s nominal wait.
// This stays above the server AI budget (140 s) plus response/job persistence.
const PDF_PARSE_MAX_POLL_ATTEMPTS = 100;

const isAbortLikeError = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return String(error).toLowerCase().includes('abort');
};

// Defensive parser: returns Date only if the input yields a valid timestamp.
// Server-side normalization (parse-pdf-statement) already converts to YYYY-MM-DD,
// but we keep this guard so a single bad row can never crash the import UI.
const safeParseDate = (input: unknown): Date | null => {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input !== 'string' || !input.trim()) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toParseResult = (data: any): PDFParseResult => ({
  transactions: reclassifyInternalTransfers(data.transactions || [])
    .map((tx: any) => {
      const date = safeParseDate(tx.date);
      if (!date) return null;
      return {
        ...tx,
        date,
        category: tx.category as Category,
        type: tx.type as TransactionType,
        payment_source: detectPaymentSource(tx.description, data.detected_bank, tx.card_type),
        card_last4: tx.card_last4 || null,
        is_installment: tx.is_installment === true,
        installment_current: typeof tx.installment_current === 'number' ? tx.installment_current : null,
        installment_total: typeof tx.installment_total === 'number' ? tx.installment_total : null,
        installment_base_description: tx.installment_base_description ?? null,
        due_date_override: tx.due_date_override ?? null,
        is_statement_total: tx.is_statement_total === true,
        balance_after: typeof tx.balance_after === 'number' && Number.isFinite(tx.balance_after) ? tx.balance_after : null,
        is_pending: tx.is_pending === true,
      };
    })
    .filter((tx: ParsedPDFTransaction | null): tx is ParsedPDFTransaction => tx !== null),
  detected_bank: data.detected_bank || null,
  account_iban: data.account_iban || null,
  holder_name: data.holder_name || null,
  cards_detected: data.cards_detected || [],
  statement_due_date: data.statement_due_date ?? null,
  summary: data.summary
});

// Detect payment source from description, card_type, or detected bank
function detectPaymentSource(
  description: string, 
  detectedBank?: string | null, 
  cardType?: string | null
): PaymentSource {
  // If card_type is provided from AI, use it directly if it's a valid PaymentSource
  if (cardType) {
    const validSources: PaymentSource[] = [
      'visa', 'visa_gold', 'visa_platinum', 'visa_kekspay', 'visa_erste',
      'mastercard', 'mastercard_gold', 'mastercard_platinum', 'maestro',
      'amex', 'diners', 'revolut', 'aircash', 'crypto', 'bank', 'cash', 'other'
    ];
    if (validSources.includes(cardType as PaymentSource)) {
      return cardType as PaymentSource;
    }
  }
  
  const desc = description.toLowerCase();
  const bank = (detectedBank || '').toLowerCase();
  
  // Check for specific card types in description
  if (desc.includes('visa platinum') || desc.includes('platinum visa')) return 'visa_platinum';
  if (desc.includes('visa gold') || desc.includes('gold visa')) return 'visa_gold';
  if (desc.includes('visa')) return 'visa';
  if (desc.includes('mastercard platinum') || desc.includes('mc platinum')) return 'mastercard_platinum';
  if (desc.includes('mastercard gold') || desc.includes('mc gold')) return 'mastercard_gold';
  if (desc.includes('mastercard') || desc.includes(' mc ')) return 'mastercard';
  if (desc.includes('maestro')) return 'maestro';
  if (desc.includes('amex') || desc.includes('american express')) return 'amex';
  if (desc.includes('diners')) return 'diners';
  
  // Check detected bank
  if (bank.includes('revolut')) return 'revolut';
  if (bank.includes('aircash')) return 'aircash';
  
  // Check description for payment hints
  if (desc.includes('revolut')) return 'revolut';
  if (desc.includes('aircash')) return 'aircash';
  if (desc.includes('crypto') || desc.includes('bitcoin') || desc.includes('ethereum')) return 'crypto';
  
  // Croatian banks
  if (bank.includes('pbz') || bank.includes('erste') || bank.includes('zaba') || 
      bank.includes('otp') || bank.includes('rba') || bank.includes('addiko') ||
      bank.includes('bank') || bank.includes('banka')) return 'bank';
  
  return 'bank'; // Default to bank for PDF statements
}

export const usePDFParser = () => {
  const { t } = useTranslation();
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<PDFParseResult | null>(null);

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      throw new Error(t('errors.pdf.loginRequired', 'Moraš biti prijavljen za analizu izvoda'));
    }
    return token;
  };

  const startPDFParseJob = async (base64Data: string, bankType?: string, isImage?: boolean): Promise<string> => {
    const token = await getAccessToken();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-pdf-statement`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfBase64: base64Data,
          bankType,
          isImage: isImage || false,
          async: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        const quotaError = await parseAiQuotaError(response.clone());
        if (quotaError?.kind === 'core_scan_limit') {
          emitCoreScanLimitReached(quotaError.resetAt);
          throw new Error(t('scanner.coreQuota.title', 'Iskorišten je besplatni limit skeniranja'));
        }
        if (quotaError?.kind === 'cost_cap') {
          throw new Error(t('errors.ai.capReached', 'AI obrada je privremeno pauzirana do 1. u mjesecu.'));
        }
        throw new Error(t('errors.pdf.rateLimit', 'Previše zahtjeva. Pokušaj ponovno za minutu.'));
      }
      if (response.status === 402) throw new Error(t('errors.pdf.noCredits', 'Nedostaje kredita za AI obradu.'));
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Greška pri analizi izvoda');
    }

    const data = await response.json();
    if (!data?.jobId) throw new Error('Obrada izvoda nije vratila identifikator posla');
    logDiagnostic('pdf_parse_job_started', { job_id: data.jobId, is_image: !!isImage });
    return data.jobId;
  };

  const fetchPDFParseJob = async (jobId: string, abortSignal?: AbortSignal): Promise<PDFParseJobRow | null> => {
    let query = (supabase as any)
      .from('pdf_parse_jobs')
      .select('status,result,error')
      .eq('id', jobId)
      .maybeSingle();

    if (abortSignal) query = query.abortSignal(abortSignal);

    const { data: job, error } = await query;

    if (error) {
      logDiagnostic('pdf_parse_job_poll_error', { job_id: jobId, message: error.message });
      throw new Error(error.message || 'Greška pri dohvaćanju rezultata obrade');
    }

    return job as PDFParseJobRow | null;
  };

  const fetchLatestPDFParseJob = async (): Promise<{ id: string; job: PDFParseJobRow } | null> => {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: job, error } = await (supabase as any)
      .from('pdf_parse_jobs')
      .select('id,status,result,error,created_at')
      .gte('created_at', since)
      .in('status', ['processing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logDiagnostic('pdf_parse_latest_job_error', { message: error.message });
      throw new Error(error.message || 'Greška pri dohvaćanju zadnje obrade');
    }

    if (!job?.id) return null;
    return { id: job.id, job: job as PDFParseJobRow };
  };

  const waitForPDFParseJob = async (
    jobId: string,
    options?: { onStatus?: (status: PDFParseJobStatus, attempt: number) => void }
  ): Promise<PDFParseResult | null> => {
    let lastStatus: PDFParseJobStatus | null = null;
    logDiagnostic('pdf_parse_job_poll_started', { job_id: jobId });

    for (let attempt = 0; attempt < PDF_PARSE_MAX_POLL_ATTEMPTS; attempt += 1) {
      await wait(attempt < 10 ? 1000 : 2000);
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), POLL_REQUEST_TIMEOUT_MS);
      let job: PDFParseJobRow | null = null;
      try {
        job = await fetchPDFParseJob(jobId, controller.signal);
      } catch (error) {
        if (!isAbortLikeError(error)) throw error;
        logDiagnostic('pdf_parse_job_poll_request_timeout', { job_id: jobId, attempt });
        continue;
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (!job) continue;

      if (job.status !== lastStatus || attempt === 0 || attempt % 10 === 0) {
        logDiagnostic('pdf_parse_job_poll_status', { job_id: jobId, status: job.status, attempt });
      }
      lastStatus = job.status;
      options?.onStatus?.(job.status, attempt);

      if (job.status === 'failed') throw new Error(job.error || 'Greška pri analizi izvoda');
      if (job.status === 'completed' && job.result) {
        const result = toParseResult(job.result);
        setParsedData(result);
        logDiagnostic('pdf_parse_job_completed', {
          job_id: jobId,
          count: result.transactions.length,
        });
        return result;
      }
    }

    logDiagnostic('pdf_parse_job_poll_timeout', { job_id: jobId },);
    throw new Error('Isteklo je vrijeme čekanja rezultata obrade izvoda');
  };

  const parseStatement = async (base64Data: string, bankType?: string, isImage?: boolean): Promise<PDFParseResult | null> => {
    setParsing(true);
    
    try {
      const jobId = await startPDFParseJob(base64Data, bankType, isImage);
      const result = await waitForPDFParseJob(jobId);
      if (!result) return null;
      
      const bankInfo = result.detected_bank ? ` (${result.detected_bank})` : '';
      const cardInfo = result.cards_detected.length > 0 ? `, ${result.cards_detected.length} kartica` : '';
      showSuccess(`Pronađeno ${result.transactions.length} transakcija${bankInfo}${cardInfo}`);
      return result;
    } catch (error) {
      console.error('Error parsing statement:', error);
      logDiagnostic('pdf_parse_failed', {
        message: error instanceof Error ? error.message : String(error),
        is_image: !!isImage,
      });
      showError(t('errors.pdf.parseFailed', 'Greška pri analizi izvoda'));
      return null;
    } finally {
      setParsing(false);
    }
  };

  // Legacy alias
  const parsePDF = async (pdfBase64: string, bankType?: string) => parseStatement(pdfBase64, bankType, false);

  // Photo parsing
  const parsePhoto = async (imageBase64: string) => parseStatement(imageBase64, undefined, true);

  // HTML parsing
  const parseHTML = async (htmlContent: string): Promise<PDFParseResult | null> => {
    setParsing(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData?.session?.access_token) {
        showError(t('errors.pdf.loginRequired', 'Moraš biti prijavljen za analizu izvoda'));
        return null;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-pdf-statement`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ htmlContent }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          const quotaError = await parseAiQuotaError(response.clone());
          if (quotaError?.kind === 'core_scan_limit') {
            emitCoreScanLimitReached(quotaError.resetAt);
            return null;
          }
          showError(t('errors.pdf.rateLimit', 'Previše zahtjeva. Pokušaj ponovno za minutu.'));
          return null;
        }
        if (response.status === 402) {
          showError(t('errors.pdf.noCredits', 'Nedostaje kredita za AI obradu.'));
          return null;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Greška pri analizi izvoda');
      }

      const data = await response.json();
      
      const result: PDFParseResult = {
        transactions: reclassifyInternalTransfers(data.transactions || [])
          .map((tx: any) => {
            const date = safeParseDate(tx.date);
            if (!date) return null;
            return {
              ...tx,
              date,
              category: tx.category as Category,
              type: tx.type as TransactionType,
              payment_source: detectPaymentSource(tx.description, data.detected_bank, tx.card_type),
              card_last4: tx.card_last4 || null,
              is_installment: tx.is_installment === true,
              installment_current: typeof tx.installment_current === 'number' ? tx.installment_current : null,
              installment_total: typeof tx.installment_total === 'number' ? tx.installment_total : null,
              installment_base_description: tx.installment_base_description ?? null,
              due_date_override: tx.due_date_override ?? null,
              is_statement_total: tx.is_statement_total === true,
              balance_after: typeof tx.balance_after === 'number' && Number.isFinite(tx.balance_after) ? tx.balance_after : null,
              is_pending: tx.is_pending === true,
            };
          })
          .filter((tx: ParsedPDFTransaction | null): tx is ParsedPDFTransaction => tx !== null),
        detected_bank: data.detected_bank || null,
        account_iban: data.account_iban || null,
        holder_name: data.holder_name || null,
        cards_detected: data.cards_detected || [],
        statement_due_date: data.statement_due_date ?? null,
        summary: data.summary
      };

      setParsedData(result);
      
      const bankInfo = result.detected_bank ? ` (${result.detected_bank})` : '';
      showSuccess(`Pronađeno ${result.transactions.length} transakcija${bankInfo}`);
      return result;
    } catch (error) {
      console.error('Error parsing HTML statement:', error);
      showError(error instanceof Error ? error.message : t('toasts.htmlAnalysisError'));
      return null;
    } finally {
      setParsing(false);
    }
  };

  const clearParsedData = () => {
    setParsedData(null);
  };

  return {
    parsing,
    parsedData,
    startPDFParseJob,
    waitForPDFParseJob,
    fetchPDFParseJob,
    fetchLatestPDFParseJob,
    parsePDF,
    parsePhoto,
    parseHTML,
    clearParsedData,
    normalizeJobResult: toParseResult,
  };
};
