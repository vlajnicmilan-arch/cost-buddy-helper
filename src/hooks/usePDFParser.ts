import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category, PaymentSource, TransactionType } from '@/types/expense';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { logDiagnostic } from '@/lib/diagnosticLogger';

export interface ParsedPDFTransaction {
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
  merchant_name: string | null;
  payment_source?: PaymentSource;
  card_last4?: string | null;
}

interface PDFParseResult {
  transactions: ParsedPDFTransaction[];
  detected_bank: string | null;
  account_iban: string | null;
  holder_name: string | null;
  cards_detected: string[];
  summary: {
    total_income: number;
    total_expenses: number;
    transaction_count: number;
  } | null;
}

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const toParseResult = (data: any): PDFParseResult => ({
  transactions: (data.transactions || []).map((tx: any) => ({
    ...tx,
    date: new Date(tx.date),
    category: tx.category as Category,
    type: tx.type as TransactionType,
    payment_source: detectPaymentSource(tx.description, data.detected_bank, tx.card_type),
    card_last4: tx.card_last4 || null
  })),
  detected_bank: data.detected_bank || null,
  account_iban: data.account_iban || null,
  holder_name: data.holder_name || null,
  cards_detected: data.cards_detected || [],
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

  const parseStatement = async (base64Data: string, bankType?: string, isImage?: boolean): Promise<PDFParseResult | null> => {
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
          body: JSON.stringify({ 
            pdfBase64: base64Data, 
            bankType,
            isImage: isImage || false
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
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
        transactions: (data.transactions || []).map((tx: any) => ({
          ...tx,
          date: new Date(tx.date),
          category: tx.category as Category,
          type: tx.type as TransactionType,
          payment_source: detectPaymentSource(tx.description, data.detected_bank, tx.card_type),
          card_last4: tx.card_last4 || null
        })),
        detected_bank: data.detected_bank || null,
        account_iban: data.account_iban || null,
        holder_name: data.holder_name || null,
        cards_detected: data.cards_detected || [],
        summary: data.summary
      };

      setParsedData(result);
      
      const bankInfo = result.detected_bank ? ` (${result.detected_bank})` : '';
      const cardInfo = result.cards_detected.length > 0 ? `, ${result.cards_detected.length} kartica` : '';
      showSuccess(`Pronađeno ${result.transactions.length} transakcija${bankInfo}${cardInfo}`);
      return result;
    } catch (error) {
      console.error('Error parsing statement:', error);
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
        transactions: (data.transactions || []).map((tx: any) => ({
          ...tx,
          date: new Date(tx.date),
          category: tx.category as Category,
          type: tx.type as TransactionType,
          payment_source: detectPaymentSource(tx.description, data.detected_bank, tx.card_type),
          card_last4: tx.card_last4 || null
        })),
        detected_bank: data.detected_bank || null,
        account_iban: data.account_iban || null,
        holder_name: data.holder_name || null,
        cards_detected: data.cards_detected || [],
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
    parsePDF,
    parsePhoto,
    parseHTML,
    clearParsedData
  };
};
