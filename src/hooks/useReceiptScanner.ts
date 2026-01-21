import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category } from '@/types/expense';
import { toast } from 'sonner';

interface ParsedReceipt {
  amount: number;
  merchant: string;
  description: string;
  category: Category;
}

export const useReceiptScanner = () => {
  const [scanning, setScanning] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null);

  const scanReceipt = async (imageBase64: string): Promise<ParsedReceipt | null> => {
    setScanning(true);
    setParsedData(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        toast.error('Moraš biti prijavljen');
        return null;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({ imageBase64 })
        }
      );

      if (response.status === 429) {
        toast.error('Previše zahtjeva. Pokušaj ponovno za minutu.');
        return null;
      }

      if (response.status === 402) {
        toast.error('Nedostaje kredita za AI obradu.');
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Greška pri skeniranju');
      }

      const data = await response.json();
      
      const result: ParsedReceipt = {
        amount: data.amount,
        merchant: data.merchant,
        description: data.description,
        category: data.category as Category
      };

      setParsedData(result);
      toast.success('Račun uspješno skeniran!');
      return result;
    } catch (error) {
      console.error('Error scanning receipt:', error);
      toast.error(error instanceof Error ? error.message : 'Greška pri skeniranju računa');
      return null;
    } finally {
      setScanning(false);
    }
  };

  const clearParsedData = () => {
    setParsedData(null);
  };

  return {
    scanning,
    parsedData,
    scanReceipt,
    clearParsedData
  };
};
