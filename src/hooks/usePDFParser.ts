import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category, PaymentSource } from '@/types/expense';
import { toast } from 'sonner';

export interface ParsedPDFTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  category: Category;
  merchant_name: string | null;
  payment_source?: PaymentSource;
  card_last4?: string | null;
}

interface PDFParseResult {
  transactions: ParsedPDFTransaction[];
  detected_bank: string | null;
  account_iban: string | null;
  cards_detected: string[];
  summary: {
    total_income: number;
    total_expenses: number;
    transaction_count: number;
  } | null;
}

// Detect payment source from description or detected bank
function detectPaymentSource(description: string, detectedBank?: string | null): PaymentSource {
  const desc = description.toLowerCase();
  const bank = (detectedBank || '').toLowerCase();
  
  // Check detected bank first
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
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<PDFParseResult | null>(null);

  const parsePDF = async (pdfBase64: string, bankType?: string): Promise<PDFParseResult | null> => {
    setParsing(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData?.session?.access_token) {
        toast.error('Moraš biti prijavljen za analizu PDF-a');
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
          body: JSON.stringify({ pdfBase64, bankType }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          toast.error('Previše zahtjeva. Pokušaj ponovno za minutu.');
          return null;
        }
        if (response.status === 402) {
          toast.error('Nedostaje kredita za AI obradu.');
          return null;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Greška pri analizi PDF-a');
      }

      const data = await response.json();
      
      // Convert date strings to Date objects and add payment source
      const result: PDFParseResult = {
        transactions: (data.transactions || []).map((tx: any) => ({
          ...tx,
          date: new Date(tx.date),
          category: tx.category as Category,
          type: tx.type as 'expense' | 'income',
          payment_source: detectPaymentSource(tx.description, data.detected_bank),
          card_last4: tx.card_last4 || null
        })),
        detected_bank: data.detected_bank || null,
        account_iban: data.account_iban || null,
        cards_detected: data.cards_detected || [],
        summary: data.summary
      };

      setParsedData(result);
      
      // Show detection info in toast
      const bankInfo = result.detected_bank ? ` (${result.detected_bank})` : '';
      const cardInfo = result.cards_detected.length > 0 ? `, ${result.cards_detected.length} kartica` : '';
      toast.success(`Pronađeno ${result.transactions.length} transakcija${bankInfo}${cardInfo}`);
      return result;
    } catch (error) {
      console.error('Error parsing PDF:', error);
      toast.error(error instanceof Error ? error.message : 'Greška pri analizi PDF-a');
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
    clearParsedData
  };
};
