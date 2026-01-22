import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category } from '@/types/expense';
import { toast } from 'sonner';

interface ParsedPDFTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  category: Category;
  merchant_name: string | null;
}

interface PDFParseResult {
  transactions: ParsedPDFTransaction[];
  summary: {
    total_income: number;
    total_expenses: number;
    transaction_count: number;
  } | null;
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
      
      // Convert date strings to Date objects
      const result: PDFParseResult = {
        transactions: (data.transactions || []).map((tx: any) => ({
          ...tx,
          date: new Date(tx.date),
          category: tx.category as Category,
          type: tx.type as 'expense' | 'income'
        })),
        summary: data.summary
      };

      setParsedData(result);
      toast.success(`Pronađeno ${result.transactions.length} transakcija`);
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
